# MCP 天氣 API：D1 城市經緯度查詢 + OpenWeatherMap 天氣
import json
from urllib.parse import urlparse, parse_qs

from workers import WorkerEntrypoint, Response, fetch


OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5/weather"
HTTP_TIMEOUT_MS = 10_000


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = request.url
        parsed = urlparse(url)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)

        if path == "/" or path == "/health":
            return Response.json({"ok": True, "service": "mcp-weather-api"})

        if path == "/api/coordinates":
            return await self._handle_coordinates(query)
        if path == "/api/weather":
            return await self._handle_weather(query)

        return Response.json({"error": "Not Found", "path": path}, status=404)

    async def _handle_coordinates(self, query):
        city = (query.get("city") or [None])[0]
        if not city or not str(city).strip():
            return Response.json(
                {"error": "Missing or empty 'city' query parameter"},
                status=400,
            )
        city = str(city).strip()
        try:
            stmt = self.env.DB.prepare(
                "SELECT id, name, country, lon, lat FROM cities WHERE name LIKE ?1 LIMIT 20"
            ).bind(f"%{city}%")
            result = await stmt.run()
        except Exception as e:
            return Response.json(
                {"error": "Database query failed", "detail": str(e)},
                status=500,
            )
        rows = getattr(result, "results", []) or []
        if not rows:
            return Response.json(
                {"error": "No city found", "query": city},
                status=404,
            )
        return Response.json({"cities": rows})

    async def _handle_weather(self, query):
        lat = (query.get("lat") or [None])[0]
        lon = (query.get("lon") or [None])[0]
        if lat is None or lon is None:
            return Response.json(
                {"error": "Missing 'lat' or 'lon' query parameter"},
                status=400,
            )
        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (TypeError, ValueError):
            return Response.json(
                {"error": "Invalid lat or lon: must be numbers"},
                status=400,
            )
        api_key = getattr(self.env, "OPENWEATHERMAP_API_KEY", None) or getattr(
            self.env, "OPEN_WEATHER_KEY", None
        )
        if not api_key:
            return Response.json(
                {"error": "OpenWeatherMap API key not configured"},
                status=503,
            )
        url = f"{OPENWEATHER_BASE}?lat={lat_f}&lon={lon_f}&appid={api_key}&units=metric"
        try:
            res = await fetch(url, method="GET")
        except Exception as e:
            return Response.json(
                {"error": "Request to weather API failed", "detail": str(e)},
                status=502,
            )
        if res.status == 429:
            return Response.json(
                {"error": "API 呼叫次數已達上限，請稍後再試 (Rate limit exceeded)"},
                status=429,
            )
        if res.status == 401:
            return Response.json(
                {"error": "Invalid OpenWeatherMap API key"},
                status=503,
            )
        if res.status != 200:
            return Response.json(
                {"error": f"Weather API returned status {res.status}"},
                status=502,
            )
        try:
            raw = await res.text()
            data = json.loads(raw) if isinstance(raw, str) else raw
        except Exception as e:
            return Response.json(
                {"error": "Invalid JSON from weather API", "detail": str(e)},
                status=502,
            )
        return Response.json(data)
