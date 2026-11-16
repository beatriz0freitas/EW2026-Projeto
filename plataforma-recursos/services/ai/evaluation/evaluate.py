"""Reproducible lexical, FAISS and local-LLM benchmark for the public fixture corpus."""

from __future__ import annotations

import csv
import json
import math
import os
import re
import statistics
import sys
import tempfile
import time
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[4]
AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from app.config import Settings  # noqa: E402
from app.embeddings import OllamaEmbeddingClient  # noqa: E402
from app.indexer import FaissIndexer  # noqa: E402
from app.ollama_client import OllamaUnavailable  # noqa: E402
from app.rag import OllamaGenerationClient  # noqa: E402
from app.recommender import RecommenderEngine  # noqa: E402
from app.retrieval import FaissRetriever  # noqa: E402

DATA = ROOT / "plataforma-recursos/data/ai-fixtures"
OUTPUT = ROOT / "docs/ai-extension/EXPERIMENTS.csv"
METHODS = ("lexical", "vector", "llm_rerank")
FIELDS = ("titulo", "tema", "hashtags")
TOKEN_PATTERN = re.compile(r"[a-z0-9]+", re.IGNORECASE)


class CandidateCapturingRetriever:
    """Delegate retrieval and retain the exact candidate set seen by reranking."""

    def __init__(self, retriever: FaissRetriever) -> None:
        self.retriever = retriever
        self.candidates: list[Any] = []

    def search(self, query: str, allowed_ids: list[str], top_k: int):
        response = self.retriever.search(query, allowed_ids, top_k)
        self.candidates = response.items
        return response


class CapturingGeneration:
    """Capture the unmodified model output for independent JSON conformance scoring."""

    def __init__(self, provider: OllamaGenerationClient) -> None:
        self.provider = provider
        self.last_response: str | None = None

    @property
    def model_id(self) -> str:
        return self.provider.model_id

    def __call__(self, system: str, user: str) -> str:
        self.last_response = self.provider(system, user)
        return self.last_response


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def tokens(text: str) -> list[str]:
    folded = unicodedata.normalize("NFKD", text.casefold())
    plain = "".join(char for char in folded if not unicodedata.combining(char))
    return TOKEN_PATTERN.findall(plain)


def lexical_ranking(query: str, resources: list[dict[str, Any]]) -> list[str]:
    query_terms = set(tokens(query))
    scored: list[tuple[float, int, str]] = []
    weights = {"titulo": 3.0, "tema": 2.0, "hashtags": 1.0}
    for position, resource in enumerate(resources):
        values = resource["metadata"]["resource"]
        score = 0.0
        for field in FIELDS:
            value = values.get(field, [])
            content = " ".join(value) if isinstance(value, list) else str(value)
            field_terms = set(tokens(content))
            score += weights[field] * len(query_terms & field_terms)
        scored.append((score, -position, resource["_id"]))
    return [resource_id for score, _, resource_id in sorted(scored, reverse=True) if score > 0]


def precision_at_k(ranking: list[str], relevant: set[str], k: int = 5) -> float:
    return sum(resource_id in relevant for resource_id in ranking[:k]) / k


def ndcg_at_k(ranking: list[str], judgments: dict[str, int], k: int = 5) -> float:
    def dcg(scores: list[int]) -> float:
        return sum((2**score - 1) / math.log2(rank + 2) for rank, score in enumerate(scores))

    actual = dcg([judgments.get(resource_id, 0) for resource_id in ranking[:k]])
    ideal = dcg(sorted(judgments.values(), reverse=True)[:k])
    return actual / ideal if ideal else 0.0


def citations_are_compliant(raw: str | None, candidate_chunks: dict[str, str]) -> bool:
    if raw is None:
        return False
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return False
    recommendations = payload.get("recommendations") if isinstance(payload, dict) else None
    if not isinstance(recommendations, list) or not recommendations:
        return False
    for recommendation in recommendations:
        if not isinstance(recommendation, dict):
            return False
        resource_id = recommendation.get("resourceId")
        chunks = recommendation.get("supportingChunkIds")
        if resource_id not in candidate_chunks or not isinstance(chunks, list) or not chunks:
            return False
        if any(chunk != candidate_chunks[resource_id] for chunk in chunks):
            return False
    return True


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(fraction * len(ordered)) - 1)]


def evaluate() -> int:
    resources = json.loads((DATA / "resources.json").read_text(encoding="utf-8"))
    public = [
        resource
        for resource in resources
        if resource.get("metadata", {}).get("resource", {}).get("visibilidade") == "publico"
    ]
    queries = read_jsonl(DATA / "queries.jsonl")
    judgments = {
        row["query_id"]: dict(row["ratings"]) for row in read_jsonl(DATA / "judgments.jsonl")
    }
    public_ids = [resource["_id"] for resource in public]
    output_rows: list[dict[str, Any]] = []
    latencies: dict[str, list[float]] = {method: [] for method in METHODS}
    citation_values: list[float] = []
    json_values: list[float] = []

    # Lexical baseline needs no external service and always runs on the checked-in corpus.
    for query in queries:
        start = time.perf_counter()
        ranking = lexical_ranking(query["query"], public)
        elapsed = (time.perf_counter() - start) * 1000
        relevance = judgments[query["id"]]
        p5 = precision_at_k(
            ranking, {resource_id for resource_id, score in relevance.items() if int(score) > 0}
        )
        ndcg = ndcg_at_k(
            ranking, {resource_id: int(score) for resource_id, score in relevance.items()}
        )
        output_rows.append(make_row(query["id"], "lexical", "ok", p5, ndcg, elapsed, None, None))
        latencies["lexical"].append(elapsed)

    os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "benchmark-local-only")
    settings = Settings.from_env()
    embedding = OllamaEmbeddingClient(settings)
    generation = OllamaGenerationClient(settings)
    try:
        with tempfile.TemporaryDirectory(prefix="ew2026-evaluation-") as index_directory:
            indexer = FaissIndexer(Path(index_directory), embedder=embedding)
            indexer.build(resources)
            retriever = FaissRetriever(Path(index_directory), embedding)

            for query in queries:
                relevance = judgments[query["id"]]
                relevance_int = {
                    resource_id: int(score) for resource_id, score in relevance.items()
                }
                relevant_ids = {
                    resource_id for resource_id, score in relevance_int.items() if score > 0
                }

                start = time.perf_counter()
                vector_ids: list[str] = []
                vector_status = "ok"
                try:
                    result = retriever.search(query["query"], public_ids, 5)
                    vector_ids = [item.resourceId for item in result.items]
                except (OllamaUnavailable, RuntimeError, ValueError):
                    vector_status = "unavailable"
                vector_elapsed = (time.perf_counter() - start) * 1000
                if vector_status == "ok":
                    p5 = precision_at_k(vector_ids, relevant_ids)
                    ndcg = ndcg_at_k(vector_ids, relevance_int)
                    output_rows.append(
                        make_row(query["id"], "vector", "ok", p5, ndcg, vector_elapsed, None, None)
                    )
                    latencies["vector"].append(vector_elapsed)
                else:
                    output_rows.append(
                        make_row(query["id"], "vector", vector_status, None, None, None, None, None)
                    )

                observed_retriever = CandidateCapturingRetriever(retriever)
                engine = RecommenderEngine(
                    observed_retriever, generation, settings.llm_model, candidate_count=15
                )
                # Keep raw output to score JSON conformance independently of fallback behavior.
                captured = CapturingGeneration(generation)
                engine.generator = captured
                start = time.perf_counter()
                try:
                    result = engine.recommend(query["query"], public_ids, 5)
                    rerank_status = "ok" if result.method == "llm_rerank" else "fallback"
                    ranking = [item.resourceId for item in result.recommendations]
                    json_valid = False
                    if captured.last_response is not None:
                        try:
                            payload = json.loads(captured.last_response)
                            json_valid = isinstance(payload, dict) and isinstance(
                                payload.get("recommendations"), list
                            )
                        except (TypeError, json.JSONDecodeError):
                            pass
                    candidate_chunks = {
                        item.resourceId: item.chunkId for item in observed_retriever.candidates
                    }
                    citation_ok = citations_are_compliant(captured.last_response, candidate_chunks)
                    rerank_elapsed = (time.perf_counter() - start) * 1000
                    latencies["llm_rerank"].append(rerank_elapsed)
                    if rerank_status == "ok":
                        p5 = precision_at_k(ranking, relevant_ids)
                        ndcg = ndcg_at_k(ranking, relevance_int)
                        rerank_note = ""
                    else:
                        p5 = ndcg = None
                        if captured.last_response is None:
                            rerank_note = "generation_timeout_or_unavailable"
                        elif json_valid:
                            rerank_note = "valid_json_rejected_by_recommender"
                        else:
                            rerank_note = "invalid_json_fallback"
                    output_rows.append(
                        make_row(
                            query["id"],
                            "llm_rerank",
                            rerank_status,
                            p5,
                            ndcg,
                            rerank_elapsed,
                            citation_ok,
                            json_valid,
                            rerank_note,
                        )
                    )
                    citation_values.append(float(citation_ok))
                    json_values.append(float(json_valid))
                except (OllamaUnavailable, RuntimeError, ValueError):
                    rerank_elapsed = (time.perf_counter() - start) * 1000
                    latencies["llm_rerank"].append(rerank_elapsed)
                    citation_values.append(0.0)
                    json_values.append(0.0)
                    output_rows.append(
                        make_row(
                            query["id"],
                            "llm_rerank",
                            "unavailable",
                            None,
                            None,
                            rerank_elapsed,
                            False,
                            False,
                            "retrieval_or_generation_error",
                        )
                    )

    except (OllamaUnavailable, RuntimeError, ValueError):
        # The lexical baseline remains valid; dependent methods are clearly marked as unrun.
        reason = "Ollama indisponível ou modelo de embeddings ausente"
        output_rows.extend(
            make_row(query["id"], method, "unavailable", None, None, None, None, None, reason)
            for method in ("vector", "llm_rerank")
            for query in queries
        )
    finally:
        embedding.close()
        generation.close()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    columns = [
        "query_id",
        "method",
        "status",
        "precision_at_5",
        "ndcg_at_5",
        "latency_ms",
        "citations_compliant",
        "json_valid",
        "notes",
    ]
    with OUTPUT.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"CSV: {OUTPUT.relative_to(ROOT)}")
    print(
        "method,reranked_n,precision_at_5_mean,ndcg_at_5_mean,latency_mean_ms,latency_p50_ms,latency_p95_ms,citation_compliance,json_valid"
    )
    for method in METHODS:
        method_rows = [row for row in output_rows if row["method"] == method]
        successful = [row for row in method_rows if row["status"] == "ok"]
        mean_p = (
            statistics.mean(float(row["precision_at_5"]) for row in successful)
            if successful
            else None
        )
        mean_n = (
            statistics.mean(float(row["ndcg_at_5"]) for row in successful) if successful else None
        )
        p50 = percentile(latencies[method], 0.50)
        p95 = percentile(latencies[method], 0.95)
        latency_mean = statistics.mean(latencies[method]) if latencies[method] else None
        citations = (
            statistics.mean(citation_values) if method == "llm_rerank" and citation_values else None
        )
        json_valid_mean = (
            statistics.mean(json_values) if method == "llm_rerank" and json_values else None
        )
        print(
            ",".join(
                (
                    method,
                    f"{len(successful)}/{len(queries)}",
                    fmt(mean_p),
                    fmt(mean_n),
                    fmt(latency_mean),
                    fmt(p50),
                    fmt(p95),
                    fmt(citations),
                    fmt(json_valid_mean),
                )
            )
        )
    return 0


def fmt(value: float | None) -> str:
    return "NA" if value is None else f"{value:.4f}"


def make_row(
    query_id: str,
    method: str,
    status: str,
    precision: float | None,
    ndcg: float | None,
    latency: float | None,
    citations: bool | None,
    json_valid: bool | None,
    notes: str = "",
) -> dict[str, Any]:
    return {
        "query_id": query_id,
        "method": method,
        "status": status,
        "precision_at_5": "" if precision is None else f"{precision:.6f}",
        "ndcg_at_5": "" if ndcg is None else f"{ndcg:.6f}",
        "latency_ms": "" if latency is None else f"{latency:.3f}",
        "citations_compliant": "" if citations is None else str(citations).lower(),
        "json_valid": "" if json_valid is None else str(json_valid).lower(),
        "notes": notes,
    }


if __name__ == "__main__":
    raise SystemExit(evaluate())
