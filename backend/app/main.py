from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.assistant.router import router as assistant_router
from app.auth.router import router as auth_router
from app.config import settings
from app.expenses.router import router as expenses_router

app = FastAPI(title="Mirrorly API")

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(expenses_router)
api.include_router(assistant_router)
# future trackers (food, wardrobe, ...) mount here


@api.get("/health")
def health():
    return {"ok": True}


app.include_router(api)
