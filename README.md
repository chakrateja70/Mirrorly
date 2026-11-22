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

**Chat assistant (the button in the corner of Home; Home itself is a dashboard of expenses, IOUs and Food & Health):** add `GROQ_API_KEY=gsk_…` to `backend/.env` (key from https://console.groq.com/keys)
and restart the backend. It logs messages like "I purchased a soap of cost 20 rupees" as categorized expenses and
answers questions like "how much did I spend on food last month?". For questions the model only returns a filter
(dates, categories, search); the totals are computed in SQL. Conversations are stored per user (`chat_messages`).
Default model `openai/gpt-oss-20b` (override with `GROQ_MODEL`; it must support structured outputs). Groq's free
tier allows ~8k tokens/min, roughly 5 chat messages a minute. Without a key the chat shows a setup hint.
Items the chat logs can be undone for 1 minute. It also logs and answers Food & Health: "slept 6 hours, had dosa" is stored as a check-in and a meal; "how much did I sleep this week?" shows figures computed from the logs; "what should I eat for dinner?" gets a coach answer from your profile, today's plan and recent meals (diet and allergies enforced).

**Food & Health (the personal coach):** a four-step onboarding (body, daily routine and work hours, usual meals,
diet, allergies and dislikes, conditions, habits such as who cooks, tea/coffee, stress and sleep troubles, goals; required
fields are starred), then daily check-ins (sleep, screen time, water in ml, exercise, energy) and meals entered as food +
amount + unit (1.5 cup rice, 100 g paneer, 250 ml buttermilk) on the page or told to the Home chat ("slept at 1, woke at 8, had biryani for lunch"). The app computes every number
and rule itself in `backend/app/wellness/coach.py`: sleep need, a target bedtime that steps 30 min at a time,
tomorrow's screen-time target (15% below last week, never under the goal), calories and protein, and insights such as
"Biryani 3 days in a row" with a cooling-day tip. The model only writes words around those facts: each meal is read
into tagged items (`GROQ_MODEL`), and the day plan and the six-week journey are written by `GROQ_PLAN_MODEL`
(default `openai/gpt-oss-120b`, low reasoning effort). Plans are sanitized before they're stored: wake and sleep
times forced, stops capped, and foods outside the diet or matching an allergy removed. Both plans render as a winding
road across a sky that follows the time of day, sunrise to starry night, which draws itself as you scroll while a car drives
it (CSS scroll-driven animations + motion path; static, without the car, under reduced motion). General wellness
guidance, not medical advice.

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
cd backend && uv run pytest tests/test_coach.py   # coach rules only: no database needed
cd frontend && node src/features/expenses/filters.check.ts   # filter/date-range logic
cd frontend && node src/ious/ious.check.ts && node src/health/road.check.ts   # IOU helpers, roadmap geometry
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

The chat assistant lives in `backend/app/assistant/` and `frontend/src/home/`. Food & Health is `backend/app/wellness/`
(API at `/api/wellness`, since `/api/health` is the healthcheck) and `frontend/src/health/` (route `/health`).
Theme: `light-dark()` color tokens in `src/index.css`; the sidebar toggle pins Light/Dark or follows the OS.
Brand: `public/brand-mark.png`, `favicon.png`, the PWA icons and `logo-light.webp` / `logo-dark.webp` are generated
from `public/Mirrorly_Logo.png`. The 2-second launch splash lives in `index.html` and plays once per browser session.

Schema changes: edit models → `uv run alembic revision --autogenerate -m "..."` → review → `uv run alembic upgrade head`.

## Deploying
See **[DEPLOY.md](DEPLOY.md)** (Vercel: API and web app as two projects, `/api` proxied so the login cookie stays first-party).
