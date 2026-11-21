# Deploying Mirrorly to Vercel

Mirrorly deploys as **two Vercel projects from this one GitHub repo**:

| Vercel project | Root Directory | What Vercel does |
|---|---|---|
| `mirrorly-api` | `backend` | Runs the FastAPI app as a Python function (auto-detected; entry `app.main:app` in `pyproject.toml`) |
| `mirrorly` | `frontend` | Builds the Vite app and serves it from the CDN; `/api/*` is forwarded to `mirrorly-api` (`frontend/vercel.json`) |

The browser only ever talks to `mirrorly`, so the login cookie stays first-party and secure (HTTPS).
The database stays on Neon, and it is already migrated.

## 0. Before you start

1. Push your latest code to GitHub (`git push`).
2. Make two production secrets (don't reuse the local ones):
   - **JWT secret** (signs logins; your local one is too short):
     ```sh
     python -c "import secrets; print(secrets.token_urlsafe(48))"
     ```
   - **Categories PIN**: pick a new one instead of `1234`.

## 1. Deploy the API (`mirrorly-api`)

1. On [vercel.com](https://vercel.com): **Add New → Project**, then import the `Mirrorly` repo.
2. Set **Project Name** to `mirrorly-api` and **Root Directory** to `backend`. The Framework Preset should show **FastAPI**.
3. Under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your Neon **pooled** connection string (same as in `backend/.env`) |
   | `JWT_SECRET` | the new secret from step 0 |
   | `GROQ_API_KEY` | your Groq key |
   | `BUDGET_PIN` | your new PIN |
   | `GROQ_MODEL` | *(optional)* defaults to `openai/gpt-oss-20b` |

4. Click **Deploy**. When it's done, open `https://<api-domain>/api/health`. It should show `{"ok":true}`.
5. Copy the API's domain from **Settings → Domains**, for example `mirrorly-api-abc123.vercel.app`.

## 2. Point the web app at the API

In `frontend/vercel.json`, replace `https://your-backend.invalid` with your API domain, keeping `/api/:path*`:

```json
{ "source": "/api/:path*", "destination": "https://mirrorly-api-abc123.vercel.app/api/:path*" }
```

Then commit and push. The placeholder `.invalid` address can never resolve, so nothing is sent anywhere until you set the real domain.

## 3. Deploy the web app (`mirrorly`)

1. **Add New → Project**, then import the **same** repo again.
2. Set **Project Name** to `mirrorly` and **Root Directory** to `frontend`. The Framework Preset should show **Vite**. No environment variables are needed.
3. Click **Deploy**, then open `https://<web-domain>`:
   - `https://<web-domain>/api/health` should show `{"ok":true}` (this proves the forwarding works).
   - Register and log in, then try the chat.
4. On your phone, open the same URL, then use the browser menu's **Add to Home screen / Install app**. It installs as an app because it's served over HTTPS.

## Updating later

- Push to `main` and both projects redeploy automatically.
- **Schema changes:** if a change adds an Alembic migration, apply it to Neon from your PC *before* pushing:
  ```sh
  cd backend && uv run alembic upgrade head
  ```

## Troubleshooting

| Symptom | Fix |
|---|---|
| API shows *500 Internal Server Error* | `mirrorly-api` → **Logs**. Usually `DATABASE_URL` or `JWT_SECRET` is missing; add it, then **Redeploy**. |
| `https://<web-domain>/api/health` fails | The domain in `frontend/vercel.json` is wrong or still the placeholder. |
| Logs in, then bounces back to login | The same as above, or the rewrite is missing `https://`. |
| Chat says "busy (Groq rate limit)" | Groq's free tier allows ~5 messages a minute; wait a few seconds. |
| A page 404s after refresh | `frontend/vercel.json` must keep the last rewrite (`/(.*)` → `/index.html`). |

## Good to know

- **First request after idle** takes about 1–2 seconds (serverless cold start).
- **Speed from India:** the API runs in Vercel's default US-East region, next to your Neon database (Ohio). Each API call is about 250 ms from India. Moving both to Singapore (Neon `ap-southeast-1` plus a Vercel function region of `sin1`) would make it faster.
- **Security limits for a public deployment:** there is no rate limit on login attempts yet, and the wrong-PIN lockout counter lives in each server instance's memory. Moving both into the database would make them strict.
- **Local development is unchanged:** `uv run fastapi dev app/main.py` plus `npm run dev`.
