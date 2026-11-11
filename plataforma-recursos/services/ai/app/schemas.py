"""Internal wire contracts. ACL membership must additionally be checked at runtime."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

ResourceId = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{24}$")]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
QueryText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
ChunkId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Score = Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class AuthorizedRequest(Contract):
    # Required even for public resources. [] means no access, never an unrestricted search.
    allowed_ids: list[ResourceId] = Field(max_length=10000)

    @field_validator("allowed_ids")
    @classmethod
    def unique_ids(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("allowed_ids must not contain duplicates")
        return value


class SearchRequest(AuthorizedRequest):
    query: QueryText
    topK: int = Field(default=5, ge=1, le=20)


class AskRequest(AuthorizedRequest):
    question: QueryText
    topK: int = Field(default=5, ge=1, le=20)


class RecommendRequest(AuthorizedRequest):
    learningGoal: QueryText
    topK: int = Field(default=5, ge=1, le=20)


class ClusterRequest(AuthorizedRequest):
    nClusters: int = Field(default=5, ge=1, le=20)


class Citation(Contract):
    resourceId: ResourceId
    chunkId: ChunkId


class SearchItem(Citation):
    score: Score
    title: ShortText
    theme: ShortText
    excerpt: Annotated[str, StringConstraints(min_length=1, max_length=5000)]


class SearchResponse(Contract):
    items: list[SearchItem] = Field(max_length=20)
    indexVersion: ShortText


class AskResponse(Contract):
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]
    citations: list[Citation] = Field(max_length=20)
    insufficientEvidence: bool
    model: ShortText
    indexVersion: ShortText


class Recommendation(Contract):
    resourceId: ResourceId
    rank: int = Field(ge=1, le=20)
    reason: QueryText
    relevanceScore: float = Field(ge=0, le=1)
    supportingChunkIds: list[ChunkId] = Field(min_length=1, max_length=20)


class RecommendResponse(Contract):
    method: Literal["llm_rerank", "semantic_fallback"]
    recommendations: list[Recommendation] = Field(max_length=20)
    model: ShortText | None
    indexVersion: ShortText


class Cluster(Contract):
    clusterId: int = Field(ge=0)
    resourceIds: list[ResourceId] = Field(min_length=1, max_length=10000)
    keywords: list[ShortText] = Field(max_length=20)


class ClusterResponse(Contract):
    clusters: list[Cluster] = Field(max_length=20)
    indexVersion: ShortText


class ModelStatus(Contract):
    name: str
    available: bool
    loaded: bool


class HealthResponse(Contract):
    status: Literal["ok", "unavailable"]
    ollama: Literal["reachable", "unavailable"]
    models: list[ModelStatus]
    code: Literal["MODELS_MISSING", "OLLAMA_UNAVAILABLE"] | None = None
