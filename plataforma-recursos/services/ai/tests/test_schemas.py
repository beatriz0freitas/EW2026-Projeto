import pytest
from pydantic import ValidationError

from app.schemas import (
    AskRequest,
    Citation,
    ClusterRequest,
    RecommendRequest,
    SearchItem,
    SearchRequest,
)

RESOURCE = "663e00000000000000000001"


@pytest.mark.parametrize("schema,fields", [
    (SearchRequest, {"query": "consenso"}), (AskRequest, {"question": "O que é consenso?"}),
    (RecommendRequest, {"learningGoal": "Aprender consenso"}), (ClusterRequest, {}),
])
def test_authorization_is_explicit_and_never_defaults_to_all(schema, fields):
    with pytest.raises(ValidationError):
        schema(**fields)
    assert schema(**fields, allowed_ids=[]).allowed_ids == []
    assert schema(**fields, allowed_ids=[RESOURCE]).allowed_ids == [RESOURCE]


@pytest.mark.parametrize("overrides", [
    {"query": "  "}, {"query": "x" * 2001}, {"topK": 0}, {"topK": 21},
    {"topK": True}, {"topK": "5"}, {"allowed_ids": None}, {"allowed_ids": ["*"]},
    {"allowed_ids": [RESOURCE, RESOURCE]}, {"allowed_ids": [RESOURCE] * 10001},
    {"aipPath": "/private/path"}, {"user": {"role": "admin"}},
])
def test_invalid_search_contracts(overrides):
    payload = {"query": "consenso", "allowed_ids": [RESOURCE]} | overrides
    with pytest.raises(ValidationError):
        SearchRequest(**payload)


@pytest.mark.parametrize("schema,field", [(AskRequest, "question"),
                                         (RecommendRequest, "learningGoal")])
def test_query_limits_on_generation_requests(schema, field):
    with pytest.raises(ValidationError):
        schema(**{field: " "}, allowed_ids=[])
    with pytest.raises(ValidationError):
        schema(**{field: "x" * 2001}, allowed_ids=[])


@pytest.mark.parametrize("count", [0, 21, True, "5"])
def test_cluster_count_must_be_bounded_integer(count):
    with pytest.raises(ValidationError):
        ClusterRequest(allowed_ids=[], nClusters=count)


@pytest.mark.parametrize("score", [float("nan"), float("inf"), 1.01, -1.01])
def test_search_similarity_must_be_finite_cosine(score):
    with pytest.raises(ValidationError):
        SearchItem(resourceId=RESOURCE, chunkId="chunk-1", score=score,
                   title="Consenso", theme="SD", excerpt="Raft")


def test_citation_requires_chunk_provenance():
    with pytest.raises(ValidationError):
        Citation(resourceId=RESOURCE)
