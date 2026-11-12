"""FastAPI entrypoint; functional AI routes arrive in subsequent tasks."""

import secrets
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response

from app.clustering import FaissClusterEngine
from app.config import Settings
from app.ollama_client import OllamaClient, OllamaUnavailable
from app.schemas import ClusterRequest, ClusterResponse, HealthResponse, ModelStatus


def require_internal_service(
    request: Request,
    token: Annotated[str | None, Header(alias="X-Internal-Token")] = None,
) -> None:
    if not token:
        raise HTTPException(status_code=401, detail={"code": "INTERNAL_TOKEN_MISSING"})
    expected = request.app.state.settings.internal_service_token.get_secret_value()
    if not secrets.compare_digest(token.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=403, detail={"code": "INTERNAL_TOKEN_INVALID"})


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        configuration = settings if settings is not None else Settings.from_env()
        application.state.settings = configuration
        application.state.ollama = OllamaClient(configuration)
        application.state.cluster_engine = FaissClusterEngine(configuration.faiss_index_path)
        try:
            yield
        finally:
            application.state.ollama.close()

    application = FastAPI(
        title="EW2026 Internal AI",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @application.get("/live")
    def live() -> dict[str, str]:
        return {"status": "ok"}

    @application.post(
        "/cluster",
        response_model=ClusterResponse,
        dependencies=[Depends(require_internal_service)],
        responses={503: {"description": "FAISS index unavailable"}},
    )
    def cluster(request: Request, payload: ClusterRequest) -> ClusterResponse:
        try:
            clusters = request.app.state.cluster_engine.cluster(
                payload.allowed_ids, payload.nClusters
            )
        except (RuntimeError, ValueError) as error:
            raise HTTPException(
                status_code=503, detail={"code": "INDEX_UNAVAILABLE"}
            ) from error
        return ClusterResponse(clusters=clusters, indexVersion="published")

    @application.get(
        "/health",
        response_model=HealthResponse,
        dependencies=[Depends(require_internal_service)],
        responses={503: {"model": HealthResponse}},
    )
    def health(request: Request, response: Response) -> HealthResponse:
        client = request.app.state.ollama
        configuration = request.app.state.settings
        response.headers["Cache-Control"] = "no-store"
        try:
            available = client.available_models()
            loaded = client.loaded_models()
        except OllamaUnavailable:
            response.status_code = 503
            return HealthResponse(
                status="unavailable", ollama="unavailable", models=[], code="OLLAMA_UNAVAILABLE"
            )
        models = [
            ModelStatus(
                name=name,
                available=OllamaClient.canonical_model(name) in available,
                loaded=OllamaClient.canonical_model(name) in loaded,
            )
            for name in dict.fromkeys([configuration.llm_model, configuration.embedding_model])
        ]
        ready = all(model.available for model in models)
        if not ready:
            response.status_code = 503
        return HealthResponse(
            status="ok" if ready else "unavailable",
            ollama="reachable",
            models=models,
            code=None if ready else "MODELS_MISSING",
        )

    return application


app = create_app()
