import json
from typing import Dict, Any
from workers import fetch
from ..config import OPENWEATHER_BASE
from ..core.exceptions import RateLimitError, AuthError, UpstreamError, ServiceError

class OpenWeatherMapService:
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def get_weather(self, lat: float, lon: float) -> Dict[str, Any]:
        url = f"{OPENWEATHER_BASE}?lat={lat}&lon={lon}&appid={self.api_key}&units=metric"
        try:
            res = await fetch(url, method="GET")
        except Exception as e:
            raise UpstreamError(f"Request to weather API failed: {e}")

        if res.status == 429:
            raise RateLimitError("API 呼叫次數已達上限，請稍後再試 (Rate limit exceeded)")
        if res.status == 401:
            raise AuthError("Invalid OpenWeatherMap API key")
        if res.status != 200:
            raise UpstreamError(f"Weather API returned status {res.status}")

        try:
            raw = await res.text()
            data = json.loads(raw) if isinstance(raw, str) else raw
        except Exception as e:
            raise UpstreamError(f"Invalid JSON from weather API: {e}")

        return data
