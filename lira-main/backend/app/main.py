"""FastAPI application entry point."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.analytics_routes import router as analytics_router
from app.api.soe_routes import router as soe_router
from app.core.config import get_settings
from app.core.logging import setup_logging, get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown events."""
    settings = get_settings()
    setup_logging(log_level=settings.log_level, json_logs=not settings.debug)
    logger.info(f"Starting {settings.app_name} on port {settings.port}")
    logger.info(f"Debug mode: {settings.debug}")
    logger.info(f"LLM provider: {settings.llm_provider.value}")

    # Start SOE worker - use ensure_future instead of create_task
    from app.services.soe_queue import soe_worker
    asyncio.ensure_future(soe_worker())
    logger.info("SOE worker started")

    yield

    logger.info("Shutting down LIRA")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="Real-time voice-to-voice English speaking agent",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(router, prefix="/api")
    app.include_router(analytics_router, prefix="/api")
    app.include_router(soe_router, prefix="/api")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run("app.main:app", host="0.0.0.0", port=8020, reload=settings.debug)