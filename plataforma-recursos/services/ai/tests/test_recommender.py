"""Tests for the pedagogical recommender engine."""

import json

import pytest

from app.ollama_client import OllamaUnavailable
from app.recommender import RecommenderEngine
from app.schemas import SearchItem, SearchResponse

# Test resource IDs
IDS = [
    "663e00000000000000000001",
    "663e00000000000000000002",
    "663e00000000000000000003",
    "663e00000000000000000004",
    "663e00000000000000000005",
]


class Retriever:
    """Mock retriever for testing."""

    def __init__(self, responses: dict[str, SearchResponse]) -> None:
        self.responses = responses
        self.calls = []

    def search(self, query: str, allowed_ids: list[str], top_k: int) -> SearchResponse:
        self.calls.append((query, allowed_ids, top_k))
        key = ":".join(sorted(allowed_ids)) if allowed_ids else "empty"
        return self.responses.get(key, SearchResponse(items=[], indexVersion="none"))


class Generator:
    """Mock LLM generator for testing."""

    def __init__(self, payload: str | Exception, model_id: str = "llama-test") -> None:
        self.payload = payload
        self._model_id = model_id
        self.calls = []

    def __call__(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload

    @property
    def model_id(self) -> str:
        return self._model_id


class MetadataProvider:
    """Mock metadata provider for testing."""

    def __init__(self, metadata: dict[str, dict]) -> None:
        self.metadata = metadata
        self.calls = []

    def get_metadata(self, resource_id: str) -> dict | None:
        self.calls.append(resource_id)
        return self.metadata.get(resource_id)


# Helper to create SearchItems
def make_search_item(
    resource_id: str,
    title: str,
    theme: str,
    excerpt: str,
    score: float,
    rank: int = 0,
) -> SearchItem:
    return SearchItem(
        resourceId=resource_id,
        chunkId=f"{resource_id}:chunk{rank}",
        score=score,
        title=title,
        theme=theme,
        excerpt=excerpt,
    )


def make_key(*ids: str) -> str:
    """Create a sorted key from multiple IDs."""
    return ":".join(sorted(ids))


def make_valid_response(recommendations: list[dict]) -> str:
    """Create a valid JSON response from the LLM."""
    return json.dumps({"recommendations": recommendations})


# Test fixture for a basic engine
# Default value for generator_payload - must not be a function call
_DEFAULT_GENERATOR_PAYLOAD = make_valid_response([])


def create_engine(
    retriever_responses: dict[str, SearchResponse] | None = None,
    generator_payload: str | Exception = _DEFAULT_GENERATOR_PAYLOAD,
    metadata: dict[str, dict] | None = None,
) -> tuple[RecommenderEngine, Retriever, Generator]:
    """Create a recommender engine with mock components."""
    retriever = Retriever(retriever_responses or {})
    generator = Generator(generator_payload)
    metadata_provider = MetadataProvider(metadata or {}) if metadata else None

    recommender = RecommenderEngine(
        retriever=retriever,
        generator=generator,
        fallback_model="llama-fallback",
        metadata_provider=metadata_provider,
        candidate_count=15,
    )
    return recommender, retriever, generator


class TestBasicRecommendation:
    """Test basic recommendation functionality."""

    def test_empty_allowed_ids_returns_empty_response(self):
        engine, _, _ = create_engine({"empty": SearchResponse(items=[], indexVersion="v1")})
        response = engine.recommend("Aprender sistemas distribuidos", [], 5)
        assert response.recommendations == []
        assert response.method == "semantic_fallback"
        assert response.model is None
        assert response.indexVersion == "none"

    def test_no_candidates_returns_empty_response(self):
        key = make_key(IDS[0], IDS[1])
        engine, _, _ = create_engine({key: SearchResponse(items=[], indexVersion="v1")})
        response = engine.recommend("Aprender sistemas distribuidos", [IDS[0], IDS[1]], 5)
        assert response.recommendations == []
        assert response.method == "semantic_fallback"

    def test_valid_recommendation_with_llm_rerank(self):
        """Test that valid LLM response produces correct recommendations."""
        items = [
            make_search_item(IDS[0], "Sistemas Distribuidos 1", "SD", "Excerto 1", 0.95),
            make_search_item(IDS[1], "Sistemas Distribuidos 2", "SD", "Excerto 2", 0.90),
        ]

        key = make_key(IDS[0], IDS[1])
        engine, _, generator = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "Mais relevante para o objetivo.",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                },
                {
                    "resourceId": IDS[1],
                    "rank": 2,
                    "reason": "Tambem relevante mas menos detalhado.",
                    "relevanceScore": 0.90,
                    "supportingChunkIds": [f"{IDS[1]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Aprender sistemas distribuidos", [IDS[0], IDS[1]], 5)

        assert response.method == "llm_rerank"
        assert len(response.recommendations) == 2
        assert response.recommendations[0].resourceId == IDS[0]
        assert response.recommendations[0].rank == 1
        assert response.recommendations[0].reason == "Mais relevante para o objetivo."
        assert response.recommendations[0].relevanceScore == pytest.approx(0.95)
        assert response.recommendations[1].resourceId == IDS[1]
        assert response.recommendations[1].rank == 2
        assert response.model == "llama-test"
        assert response.indexVersion == "v1"

    def test_top_k_limits_results(self):
        """Test that top_k parameter limits the number of recommendations."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
            make_search_item(IDS[1], "Titulo 2", "Tema", "Excerto 2", 0.90),
            make_search_item(IDS[2], "Titulo 3", "Tema", "Excerto 3", 0.85),
        ]

        key = make_key(IDS[0], IDS[1], IDS[2])
        engine, _, generator = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "Relevante 1",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                },
                {
                    "resourceId": IDS[1],
                    "rank": 2,
                    "reason": "Relevante 2",
                    "relevanceScore": 0.90,
                    "supportingChunkIds": [f"{IDS[1]}:chunk0"],
                },
                {
                    "resourceId": IDS[2],
                    "rank": 3,
                    "reason": "Relevante 3",
                    "relevanceScore": 0.85,
                    "supportingChunkIds": [f"{IDS[2]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0], IDS[1], IDS[2]], 2)

        assert len(response.recommendations) == 2
        assert response.recommendations[0].resourceId == IDS[0]
        assert response.recommendations[1].resourceId == IDS[1]


class TestFallbackMechanism:
    """Test fallback to semantic similarity when LLM fails."""

    def test_llm_unavailable_uses_fallback(self):
        """Test that LLM unavailability triggers semantic fallback."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
            make_search_item(IDS[1], "Titulo 2", "Tema", "Excerto 2", 0.90),
        ]

        key = make_key(IDS[0], IDS[1])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            OllamaUnavailable("Ollama down")
        )

        response = engine.recommend("Teste", [IDS[0], IDS[1]], 5)

        assert response.method == "semantic_fallback"
        assert len(response.recommendations) == 2
        assert response.recommendations[0].resourceId == IDS[0]
        assert response.recommendations[1].resourceId == IDS[1]
        assert response.recommendations[0].relevanceScore == pytest.approx(0.95)
        assert response.recommendations[1].relevanceScore == pytest.approx(0.90)

    def test_invalid_json_response_uses_fallback(self):
        """Test that invalid JSON from LLM triggers fallback."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
            make_search_item(IDS[1], "Titulo 2", "Tema", "Excerto 2", 0.90),
        ]

        key = make_key(IDS[0], IDS[1])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            "not valid json"
        )

        response = engine.recommend("Teste", [IDS[0], IDS[1]], 5)

        assert response.method == "semantic_fallback"
        assert len(response.recommendations) == 2

    def test_malformed_response_uses_fallback(self):
        """Test that malformed response structure triggers fallback."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        key = make_key(IDS[0])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([{"resourceId": IDS[0]}])
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "semantic_fallback"

    def test_invented_resource_id_uses_fallback(self):
        """Test that invented resource IDs in LLM response trigger fallback."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        key = make_key(IDS[0])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": "663e00000000000000000099",
                    "rank": 1,
                    "reason": "Inventado",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "semantic_fallback"


class TestValidation:
    """Test validation of LLM responses."""

    def test_validates_duplicate_ranks(self):
        """Test that duplicate ranks are rejected."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
            make_search_item(IDS[1], "Titulo 2", "Tema", "Excerto 2", 0.90),
        ]

        key = make_key(IDS[0], IDS[1])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "R1",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                },
                {
                    "resourceId": IDS[1],
                    "rank": 1,
                    "reason": "R2",
                    "relevanceScore": 0.90,
                    "supportingChunkIds": [f"{IDS[1]}:chunk0"],
                },
            ])
        )

        response = engine.recommend("Teste", [IDS[0], IDS[1]], 5)

        assert response.method == "semantic_fallback"

    def test_validates_duplicate_resource_ids(self):
        """Test that duplicate resource IDs are rejected."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        key = make_key(IDS[0])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "R1",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                },
                {
                    "resourceId": IDS[0],
                    "rank": 2,
                    "reason": "R2",
                    "relevanceScore": 0.90,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                },
            ])
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "semantic_fallback"

    def test_validates_invalid_chunk_ids(self):
        """Test that invalid chunk IDs are rejected."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        key = make_key(IDS[0])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "R1",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": ["invalid-chunk-id"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "semantic_fallback"

    def test_validates_relevance_score_range(self):
        """Test that relevance scores outside [0, 1] are rejected."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        key = make_key(IDS[0])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "R1",
                    "relevanceScore": 1.5,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "semantic_fallback"

    def test_validates_non_consecutive_ranks(self):
        """Test that non-consecutive ranks are rejected."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
            make_search_item(IDS[1], "Titulo 2", "Tema", "Excerto 2", 0.90),
        ]

        key = make_key(IDS[0], IDS[1])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "R1",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                },
                {
                    "resourceId": IDS[1],
                    "rank": 3,
                    "reason": "R2",
                    "relevanceScore": 0.90,
                    "supportingChunkIds": [f"{IDS[1]}:chunk0"],
                },
            ])
        )

        response = engine.recommend("Teste", [IDS[0], IDS[1]], 5)

        assert response.method == "semantic_fallback"


class TestMetadataEnrichment:
    """Test metadata enrichment functionality."""

    def test_enriches_with_metadata(self):
        """Test that candidates are enriched with metadata."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        metadata = {
            IDS[0]: {
                "downloadCount": 100,
                "ratingAvg": 4.5,
                "metadata": {
                    "resource": {
                        "hashtags": ["tag1", "tag2"],
                        "tema": "Sistemas Distribuidos",
                        "titulo": "Titulo Atualizado",
                    }
                }
            }
        }

        key = make_key(IDS[0])
        engine, _, generator = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "Enriquecido",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ]),
            metadata=metadata,
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "llm_rerank"
        assert len(response.recommendations) == 1
        assert len(generator.calls) == 1

    def test_works_without_metadata_provider(self):
        """Test that engine works without metadata provider."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        key = make_key(IDS[0])
        engine, _, generator = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "Sem metadata",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ]),
            metadata=None,
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "llm_rerank"
        assert len(response.recommendations) == 1


class TestRerankingAltersOrder:
    """Test that LLM reranking can alter the semantic similarity order."""

    def test_llm_reranking_changes_order(self):
        """Test that LLM reranking produces different order than FAISS."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
            make_search_item(IDS[1], "Titulo 2", "Tema", "Excerto 2", 0.90),
        ]

        key = make_key(IDS[0], IDS[1])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[1],
                    "rank": 1,
                    "reason": "LLM prefere este",
                    "relevanceScore": 0.98,
                    "supportingChunkIds": [f"{IDS[1]}:chunk0"],
                },
                {
                    "resourceId": IDS[0],
                    "rank": 2,
                    "reason": "LLM prefere menos",
                    "relevanceScore": 0.92,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0], IDS[1]], 5)

        assert response.method == "llm_rerank"
        assert response.recommendations[0].resourceId == IDS[1]
        assert response.recommendations[1].resourceId == IDS[0]


class TestParameterValidation:
    """Test parameter validation."""

    def test_negative_top_k_raises_error(self):
        """Test that negative top_k raises ValueError."""
        engine, _, _ = create_engine({})

        with pytest.raises(ValueError, match="top_k must be positive"):
            engine.recommend("Teste", [IDS[0]], 0)

    def test_zero_top_k_raises_error(self):
        """Test that zero top_k raises ValueError."""
        engine, _, _ = create_engine({})

        with pytest.raises(ValueError, match="top_k must be positive"):
            engine.recommend("Teste", [IDS[0]], 0)


class TestJustificationQuality:
    """Test that justifications are preserved and relevant."""

    def test_justifications_are_preserved(self):
        """Test that LLM justifications are preserved in the response."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        justification = (
            "Este recurso aborda diretamente o objetivo de aprendizagem "
            "com profundidade tecnica."
        )

        key = make_key(IDS[0])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": justification,
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.recommendations[0].reason == justification

    def test_empty_justification_is_rejected(self):
        """Test that empty justifications are rejected."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        key = make_key(IDS[0])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "semantic_fallback"


class TestIDFiltering:
    """Test that unauthorized IDs are properly filtered."""

    def test_only_allowed_ids_in_candidates(self):
        """Test that only allowed IDs appear in candidates."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
            make_search_item(IDS[1], "Titulo 2", "Tema", "Excerto 2", 0.90),
            make_search_item(IDS[2], "Titulo 3", "Tema", "Excerto 3", 0.85),
        ]

        key = make_key(IDS[0], IDS[1], IDS[2])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[0],
                    "rank": 1,
                    "reason": "R1",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0], IDS[1]], 5)

        resource_ids = {rec.resourceId for rec in response.recommendations}
        assert IDS[2] not in resource_ids

    def test_unauthorized_id_in_response_is_rejected(self):
        """Test that unauthorized IDs in LLM response are rejected."""
        items = [
            make_search_item(IDS[0], "Titulo 1", "Tema", "Excerto 1", 0.95),
        ]

        key = make_key(IDS[0])
        engine, _, _ = create_engine(
            {key: SearchResponse(items=items, indexVersion="v1")},
            make_valid_response([
                {
                    "resourceId": IDS[1],
                    "rank": 1,
                    "reason": "Nao autorizado",
                    "relevanceScore": 0.95,
                    "supportingChunkIds": [f"{IDS[0]}:chunk0"],
                }
            ])
        )

        response = engine.recommend("Teste", [IDS[0]], 5)

        assert response.method == "semantic_fallback"
