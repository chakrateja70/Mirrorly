# Mirrorly

A personal "track everything" app: expenses first, then food intake, wardrobe, and more.

| | Stack |
|---|---|
| `frontend/` | React + TypeScript + Vite, installable PWA (`vite-plugin-pwa`), TanStack Query, Recharts |
| `backend/` | FastAPI, SQLAlchemy 2, Alembic, Postgres on [Neon](https://neon.tech) |

## Setup

### 1. Database (Neon)
Create a Neon project, then a second **branch** called `test`. Copy the **pooled** connection string of each.

### 2. Backend
```sh
cd backend
cp .env.example .env        # fill DATABASE_URL, TEST_DATABASE_URL, JWT_SECRET
uv sync
uv run alembic upgrade head # create tables
uv run fastapi dev app/main.py   # http://localhost:8000/docs
```
Paste Neon's connection strings as-is (`postgresql://…` is mapped to the psycopg 3 driver automatically).
`TEST_DATABASE_URL` must be a *different* database (the Neon `test` branch); the test refuses to run otherwise.

**Chat assistant (Home page):** add `GROQ_API_KEY=gsk_…` to `backend/.env` (key from https://console.groq.com/keys)
and restart the backend. It logs messages like "I purchased a soap of cost 20 rupees" as categorized expenses and
answers questions like "how much did I spend on food last month?". For questions the model only returns a filter
(dates, categories, search); the totals are computed in SQL. Conversations are stored per user (`chat_messages`).
Default model `openai/gpt-oss-20b` (override with `GROQ_MODEL`; it must support structured outputs). Groq's free
tier allows ~8k tokens/min, roughly 5 chat messages a minute. Without a key the chat shows a setup hint.
Items the chat logs can be undone for 1 minute.

**Categories & budgets PIN:** the section asks for a PIN on every visit (`BUDGET_PIN` in `backend/.env`, default `1234`).
The server enforces it too: adding, editing or deleting a category needs a 10-minute unlock, and 5 wrong tries lock it for 5 minutes.

### 3. Frontend
```sh
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api -> :8000 (override: API_URL=http://localhost:8001)
```

## Tests
```sh
cd backend && uv run pytest   # WIPES the TEST_DATABASE_URL database, never point it at main
cd frontend && node src/features/expenses/filters.check.ts   # filter/date-range logic
```

## PWA check
```sh
cd frontend && npm run build && npm run preview   # http://localhost:4173
```
DevTools → Application: manifest + active service worker; the app is installable and its shell loads offline (data needs network).

## Layout
Each tracker is a self-contained module on both sides:
- backend: `app/<feature>/` (`models.py`, `schemas.py`, `router.py`, `service.py`), mounted in `app/main.py`
- frontend: `src/features/<feature>/` pages, plus an entry in the sidebar (`SECTIONS` in `src/Shell.tsx`)

The chat assistant lives in `backend/app/assistant/` and `frontend/src/home/`.
Theme: `light-dark()` color tokens in `src/index.css`; the sidebar toggle pins Light/Dark or follows the OS.
Brand: `public/brand-mark.png`, `favicon.png`, the PWA icons and `logo-light.webp` / `logo-dark.webp` are generated
from `public/Mirrorly_Logo.png`. The 2-second launch splash lives in `index.html` and plays once per browser session.

Schema changes: edit models → `uv run alembic revision --autogenerate -m "..."` → review → `uv run alembic upgrade head`.

## Deploying (later)
Auth is an httpOnly session cookie (`SameSite=Lax`), so serve the frontend and `/api` from the **same site**
(e.g. one domain with a reverse proxy, or `app.example.com` + `api.example.com`). Set `CORS_ORIGINS` only if origins differ.
