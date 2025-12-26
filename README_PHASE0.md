# CYBEV Backend — Phase 0 Stabilization

This patch focuses on **making the backend start reliably** even when environment variables (especially `MONGO_URI`) are not yet configured.

## What changed
- Added a **DB gate**: if Mongo is not connected, DB-dependent endpoints return **503** instead of hanging/crashing.
- Backend no longer exits immediately when `MONGO_URI` is missing; it boots and keeps `/api/health` available.
- Added `.gitignore` and `.env.example`.

## Run locally
```bash
cd cybev-backend-main
cp .env.example .env
npm install
npm run dev
```

Backend:
- Health: `http://localhost:5000/api/health`
- DB status: `http://localhost:5000/api/status`

## Notes
- Most endpoints require MongoDB; set `MONGO_URI` in `.env` to enable full functionality.
