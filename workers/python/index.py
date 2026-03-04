# MCP 天氣 API：D1 城市經緯度查詢 + OpenWeatherMap 天氣
# Bootstrap so Cloudflare Workers can resolve local imports (no parent package at runtime).
import sys
from pathlib import Path

_here = Path(__file__).resolve().parent
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))

from urllib.parse import urlparse, parse_qs

from workers import WorkerEntrypoint, Response

from handlers import handle_coordinates, handle_weather
from services.cities import CloudflareD1CitiesService
from services.weather import OpenWeatherMapService


class Default(WorkerEntrypoint):
    async def on_fetch(self, request):
        url = request.url
        parsed = urlparse(url)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)

        if path == "/" or path == "/health":
            return Response.json({"ok": True, "service": "mcp-weather-api"})

        if path == "/api/coordinates":
            # 建立真正的 db 依賴
            cities_service = CloudflareD1CitiesService(self.env.DB)
            return await handle_coordinates(query, cities_service)

        if path == "/api/weather":
            # 建立真正的天氣 API 依賴
            api_key = getattr(self.env, "OPEN_WEATHER_KEY", None)
            if not api_key:
                return Response.json(
                    {"error": "OpenWeatherMap API key not configured"},
                    status=503,
                )
            weather_service = OpenWeatherMapService(api_key)
            return await handle_weather(query, weather_service)

        return Response.json({"error": "Not Found", "path": path}, status=404)
