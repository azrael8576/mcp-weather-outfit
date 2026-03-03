# 階段 2 會實作 D1 查詢與 OpenWeatherMap API，此為佔位用
from workers import WorkerEntrypoint, Response


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return Response.json({"ok": True, "message": "mcp-weather-api placeholder"})
