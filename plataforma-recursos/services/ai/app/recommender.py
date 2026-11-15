"""Two-phase pedagogical recommender: FAISS candidate retrieval + LLM reranking with justification."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any, Protocol

from pydantic import ValidationError

from app.config import Settings
from app.ollama_client import OllamaUnavailable
from app.retrieval import FaissRetriever
from app.schemas import RecommendResponse, Recommendation, SearchItem


class GenerationProvider(Protocol):
    """Abstraction for the LLM generation client."""

    @property
    def model_id(self) -> str:
        """Return the configured model identity."""

    def __call__(self, system: str, user: str) -> str:
        """Generate one non-streaming response."""


class MetadataProvider(Protocol):
    """Abstraction for fetching resource metadata."""

    def get_metadata(self, resource_id: str) -> dict[str, Any] | None:
        """Return metadata for a resource or None if not found."""


class RecommenderEngine:
    """Pedagogical recommender with FAISS retrieval and LLM reranking.
    
    Phase 1: Retrieve candidate resources via FAISS semantic search.
    Phase 2: Enrich candidates with pedagogical metadata.
    Phase 3: LLM reranks candidates and generates detailed justifications.
    Phase 4: Validate output and return structured recommendations.
    """

    def __init__(
        self,
        retriever: FaissRetriever,
        generator: GenerationProvider,
        fallback_model: str,
        metadata_provider: MetadataProvider | None = None,
        candidate_count: int = 15,
        generation_timeout: float = 60.0,
    ) -> None:
        self.retriever = retriever
        self.generator = generator
        self.fallback_model = fallback_model
        self.metadata_provider = metadata_provider
        self.candidate_count = candidate_count
        self.generation_timeout = generation_timeout

    def recommend(
        self,
        learning_goal: str,
        allowed_ids: list[str],
        top_k: int,
    ) -> RecommendResponse:
        """Generate pedagogical recommendations for a learning goal.
        
        Args:
            learning_goal: The user's learning objective.
            allowed_ids: List of resource IDs the user is authorized to access.
            top_k: Number of recommendations to return.
            
        Returns:
            RecommendResponse with reranked recommendations and justifications.
        """
        if not allowed_ids:
            return RecommendResponse(
                method="semantic_fallback",
                recommendations=[],
                model=None,
                indexVersion="none",
            )
        
        if top_k < 1:
            raise ValueError("top_k must be positive")
        
        # Phase 1: Retrieve candidates via FAISS
        candidates = self.retriever.search(
            learning_goal, allowed_ids, self.candidate_count
        )
        
        if not candidates.items:
            return RecommendResponse(
                method="semantic_fallback",
                recommendations=[],
                model=None,
                indexVersion=candidates.indexVersion,
            )
        
        # Phase 2: Enrich candidates with metadata
        enriched_candidates = self._enrich_candidates(candidates.items)
        
        if not enriched_candidates:
            return RecommendResponse(
                method="semantic_fallback",
                recommendations=[],
                model=None,
                indexVersion=candidates.indexVersion,
            )
        
        # Phase 3: Build reranking prompt and get LLM response
        system_prompt, user_prompt = self._build_reranking_prompt(
            learning_goal, enriched_candidates, top_k
        )
        
        try:
            raw_response = self.generator(system_prompt, user_prompt)
            
            # Phase 4: Validate and parse response
            try:
                validated = self._validate_response(
                    raw_response, enriched_candidates, top_k
                )
                return RecommendResponse(
                    method="llm_rerank",
                    recommendations=validated,
                    model=self.generator.model_id,
                    indexVersion=candidates.indexVersion,
                )
            except (ValueError, ValidationError, json.JSONDecodeError):
                # Fallback to semantic similarity ordering
                return self._semantic_fallback(candidates, top_k)
                
        except (OllamaUnavailable, ValueError, TypeError):
            # Fallback to semantic similarity ordering
            return self._semantic_fallback(candidates, top_k)

    def _enrich_candidates(
        self, items: list[SearchItem]
    ) -> list[dict[str, Any]]:
        """Enrich candidate items with pedagogical metadata."""
        enriched = []
        for item in items:
            candidate = {
                "resourceId": item.resourceId,
                "chunkId": item.chunkId,
                "title": item.title,
                "theme": item.theme,
                "excerpt": item.excerpt,
                "score": item.score,
                # Default metadata values
                "downloadCount": 0,
                "ratingAvg": 0.0,
                "hashtags": [],
            }
            
            # Try to fetch additional metadata if provider is available
            if self.metadata_provider:
                metadata = self.metadata_provider.get_metadata(item.resourceId)
                if metadata:
                    resource_metadata = metadata.get("metadata", {}).get("resource", {})
                    candidate["downloadCount"] = metadata.get("downloadCount", 0)
                    candidate["ratingAvg"] = metadata.get("ratingAvg", 0.0)
                    candidate["hashtags"] = resource_metadata.get("hashtags", [])
                    # Preserve existing theme/title from search if not in metadata
                    if "tema" in resource_metadata:
                        candidate["theme"] = resource_metadata["tema"]
                    if "titulo" in resource_metadata:
                        candidate["title"] = resource_metadata["titulo"]
            
            enriched.append(candidate)
        
        return enriched

    def _build_reranking_prompt(
        self,
        learning_goal: str,
        candidates: list[dict[str, Any]],
        top_k: int,
    ) -> tuple[str, str]:
        """Build system and user prompts for LLM reranking."""
        system = (
            "Atuas como orientador pedagógico especializado. "
            "Avalia cada recurso com base na sua relevância para o objetivo de aprendizagem. "
            "Considera a coerência conceitual, profundidade técnica e qualidade pedagógica. "
            "Não inventes factos, IDs ou justificações. "
            "Ordena os recursos por relevância decrescente. "
            'Devolve JSON estrito com a chave "recommendations" contendo uma lista de objetos. '
            'Cada objeto deve ter: "resourceId", "rank", "reason", "relevanceScore" (0.0-1.0), '
            '"supportingChunkIds". A justificação (reason) deve ser específica e fundamentada. '
            'Usa apenas os resourceIds e chunkIds fornecidos no contexto. '
            f'Limita a {top_k} recomendações.'
        )
        
        # Build candidate blocks
        candidate_blocks = []
        for idx, candidate in enumerate(candidates):
            block = (
                f'<<<CANDIDATE id="{candidate["resourceId"]}" index="{idx}">\n'
                f'Título: {candidate["title"]}\n'
                f'Tema: {candidate["theme"]}\n'
                f'Excerto: {candidate["excerpt"][:500]}{ "..." if len(candidate["excerpt"]) > 500 else ""}\n'
                f'Downloads: {candidate["downloadCount"]}\n'
                f'Avaliação: {candidate["ratingAvg"]:.1f}\n'
                f'Hashtags: {", ".join(candidate["hashtags"][:5])}\n'
                f'Score Semântico: {candidate["score"]:.4f}\n'
                f'ChunkId: {candidate["chunkId"]}\n'
                f'</>>'
            )
            candidate_blocks.append(block)
        
        user = (
            f"Objetivo de Aprendizagem: {learning_goal}\n\n"
            f"Recursos Candidatos:\n"
            + "\n\n".join(candidate_blocks)
            + "\n\n"
            + f'Formato obrigatório: {{"recommendations": [{{ "resourceId": "...", '
            + f'"rank": 1, "reason": "...", "relevanceScore": 0.0-1.0, '
            + f'"supportingChunkIds": ["..."] }}]}}'
        )
        
        return system, user

    def _validate_response(
        self,
        raw: str,
        candidates: list[dict[str, Any]],
        top_k: int,
    ) -> list[Recommendation]:
        """Validate and parse the LLM response."""
        payload = json.loads(raw)
        
        if not isinstance(payload, Mapping):
            raise ValueError("Response must be an object")
        
        recommendations_data = payload.get("recommendations")
        if not isinstance(recommendations_data, list):
            raise ValueError("Recommendations must be a list")
        
        if len(recommendations_data) > top_k:
            raise ValueError(f"Exceeds maximum of {top_k} recommendations")
        
        # Validate candidate IDs
        candidate_resource_ids = {c["resourceId"] for c in candidates}
        candidate_chunk_ids_by_resource = {
            c["resourceId"]: c["chunkId"] for c in candidates
        }
        
        validated = []
        seen_ranks = set()
        seen_resource_ids = set()
        
        for rec in recommendations_data:
            if not isinstance(rec, Mapping):
                raise ValueError("Each recommendation must be an object")
            
            resource_id = rec.get("resourceId")
            rank = rec.get("rank")
            reason = rec.get("reason")
            relevance_score = rec.get("relevanceScore")
            supporting_chunk_ids = rec.get("supportingChunkIds", [])
            
            # Validate resourceId
            if not isinstance(resource_id, str) or resource_id not in candidate_resource_ids:
                raise ValueError(f"Invalid or unauthorized resourceId: {resource_id}")
            
            if resource_id in seen_resource_ids:
                raise ValueError(f"Duplicate resourceId: {resource_id}")
            seen_resource_ids.add(resource_id)
            
            # Validate rank
            if not isinstance(rank, int) or rank < 1 or rank > top_k:
                raise ValueError(f"Invalid rank: {rank}")
            
            if rank in seen_ranks:
                raise ValueError(f"Duplicate rank: {rank}")
            seen_ranks.add(rank)
            
            # Validate reason
            if not isinstance(reason, str) or not reason.strip():
                raise ValueError("Reason must be a non-empty string")
            
            # Validate relevanceScore
            if not isinstance(relevance_score, (int, float)) or not (0 <= relevance_score <= 1):
                raise ValueError(f"Invalid relevanceScore: {relevance_score}")
            
            # Validate supportingChunkIds
            if not isinstance(supporting_chunk_ids, list):
                raise ValueError("supportingChunkIds must be a list")
            
            if not supporting_chunk_ids:
                raise ValueError("supportingChunkIds must not be empty")
            
            # Validate each chunkId belongs to the resource
            expected_chunk_id = candidate_chunk_ids_by_resource[resource_id]
            for chunk_id in supporting_chunk_ids:
                if not isinstance(chunk_id, str) or chunk_id != expected_chunk_id:
                    raise ValueError(f"Invalid chunkId: {chunk_id}")
            
            validated.append(
                Recommendation(
                    resourceId=resource_id,
                    rank=rank,
                    reason=reason.strip(),
                    relevanceScore=float(relevance_score),
                    supportingChunkIds=list(supporting_chunk_ids),
                )
            )
        
        # Check that ranks are consecutive starting from 1
        actual_ranks = {rec.rank for rec in validated}
        expected_ranks = set(range(1, len(validated) + 1))
        if actual_ranks != expected_ranks:
            raise ValueError("Ranks must be consecutive starting from 1")
        
        # Sort by rank
        validated.sort(key=lambda r: r.rank)
        
        return validated

    def _semantic_fallback(
        self, candidates: Any, top_k: int
    ) -> RecommendResponse:
        """Fallback to semantic similarity ordering."""
        # Order by semantic score descending
        sorted_items = sorted(candidates.items, key=lambda x: x.score, reverse=True)
        
        recommendations = []
        for rank, item in enumerate(sorted_items[:top_k], start=1):
            recommendations.append(
                Recommendation(
                    resourceId=item.resourceId,
                    rank=rank,
                    reason=f"Recomendação baseada em similaridade semântica (score: {item.score:.4f})",
                    relevanceScore=float(item.score),
                    supportingChunkIds=[item.chunkId],
                )
            )
        
        return RecommendResponse(
            method="semantic_fallback",
            recommendations=recommendations,
            model=self.fallback_model,
            indexVersion=candidates.indexVersion,
        )
