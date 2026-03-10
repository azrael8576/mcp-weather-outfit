# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is an MCP (Model Context Protocol) server deployed on Cloudflare Workers with a two-worker architecture:

```
MCP Client (Cursor/Claude)
    │ SSE/HTTP
    ▼
TS Agent (TypeScript, Cloudflare Workers)   ← MCP protocol, OAuth/Access
    │ Fetch API
    ▼
Python Worker (Cloudflare Python Workers)  ← Business logic, internal API
    ├── D1 Database (city coordinates)
    └── OpenWeatherMap API (weather data)
```

**TS Agent** (`workers/ts-agent/`) exposes the MCP endpoint at `/mcp`, implements 2 Tools (`search_city_coordinates`, `get_weather`), 1 Resource (`outfit_guidelines`), and 1 Prompt (`weather_outfit_advisor`). It delegates data fetching to the Python Worker via `PYTHON_WORKER_URL`.

**Python Worker** (`workers/python/`) is an internal API with two endpoints:
- `GET /api/coordinates?city=&country=` → queries D1 database
- `GET /api/weather?lat=&lon=` → calls OpenWeatherMap API

## Common Commands

### Python Worker

```bash
# Install dependencies (including dev)
uv sync --extra dev

# Run local dev server (port 8788)
uv run pywrangler dev

# Run all tests
uv run pytest

# Run tests with verbose output
uv run pytest -v

# Run a single test file
uv run pytest workers/python/tests/test_coordinates_handler.py
```

### TS Agent

```bash
cd workers/ts-agent

npm install
npm run dev          # start local dev server
npm run type-check   # TypeScript type checking (tsc --noEmit)
npm run deploy       # deploy to Cloudflare
```

### Python Worker Deployment

```bash
npx wrangler secret put OPEN_WEATHER_KEY
npx wrangler deploy
```

### Local Dev Setup

```bash
# Initialize local D1 database
npx wrangler d1 execute mcp-weather-db --local --file=./schema.sql

# Import city data
uv run python scripts/import_cities_to_d1.py
for f in d1_chunks/insert_*.sql; do
  npx wrangler d1 execute mcp-weather-db --local --file="$f"
done

# Root .dev.vars (for Python Worker)
echo "OPEN_WEATHER_KEY=your_api_key" > .dev.vars

# TS Agent .dev.vars
echo "PYTHON_WORKER_URL=http://localhost:8788" > workers/ts-agent/.dev.vars
```

## Key Design Patterns

**Dependency injection in Python Worker**: Handlers (`handlers.py`) accept service interfaces defined as `Protocol` in `services/ports.py`. Tests inject `FakeCitiesService` / `FakeWeatherService` from `services/fakes.py` instead of real services.

**Exception hierarchy** (`core/exceptions.py`): `ServiceError` → `RateLimitError` (429), `AuthError` (401), `UpstreamError` (502). Handlers map these to HTTP status codes.

**D1 city search** (`services/cities.py`) uses a three-tier SQL strategy: exact match → prefix match → LIKE fuzzy match.

**Authentication**: TS Agent uses Cloudflare Access (OIDC/JWT) via `access-handler.ts`. The OAuth flow requires `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET`, `ACCESS_TOKEN_URL`, `ACCESS_AUTHORIZATION_URL`, `ACCESS_JWKS_URL`, and `COOKIE_ENCRYPTION_KEY` to be set as Wrangler secrets in production.

## Environment Variables

| Location | Variable | Purpose |
|----------|----------|---------|
| Root `.dev.vars` / Wrangler secret | `OPEN_WEATHER_KEY` | OpenWeatherMap API key |
| `workers/ts-agent` Wrangler secret | `PYTHON_WORKER_URL` | Python Worker URL |
| `workers/ts-agent` Wrangler secret | `ACCESS_CLIENT_ID` | Cloudflare Access OAuth client ID |
| `workers/ts-agent` Wrangler secret | `ACCESS_CLIENT_SECRET` | Cloudflare Access OAuth client secret |
| `workers/ts-agent` Wrangler secret | `ACCESS_TOKEN_URL` | Cloudflare Access token endpoint URL |
| `workers/ts-agent` Wrangler secret | `ACCESS_AUTHORIZATION_URL` | Cloudflare Access authorization endpoint URL |
| `workers/ts-agent` Wrangler secret | `ACCESS_JWKS_URL` | Cloudflare Access JWKS endpoint URL |
| `workers/ts-agent` Wrangler secret | `COOKIE_ENCRYPTION_KEY` | Key for encrypting approval cookies |

## Important Files

- `workers/ts-agent/src/index.ts` — MCP server entry point, tool implementations
- `workers/ts-agent/src/outfit-guidelines.ts` — Static outfit recommendation rules
- `workers/python/index.py` — Python Worker entry point and routing
- `workers/python/handlers.py` — Business logic handlers
- `workers/python/services/` — Service implementations and interfaces
- `schema.sql` — D1 database schema for cities table
