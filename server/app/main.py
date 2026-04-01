import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_analyze import router as analyze_router
from app.api.routes_health import router as health_router
from app.api.routes_grc import router as grc_router
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    s = get_settings()
    logger.info("Starting %s v%s", s.app_name, s.app_version)
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=s.app_name, version=s.app_version, lifespan=lifespan)

    origins = [o.strip() for o in s.cors_origins.split(",") if o.strip()]
    if origins == ["*"] or not origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(analyze_router, prefix="/api/v1")
    app.include_router(grc_router)
    return app


app = create_app()
