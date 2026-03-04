from typing import Dict, Any
from workers import Response
from .services.ports import CitiesService, WeatherService
from .core.exceptions import RateLimitError, AuthError, UpstreamError, ServiceError

async def handle_coordinates(query: Dict[str, Any], cities_service: CitiesService) -> Response:
    city = (query.get("city") or [None])[0]
    if not city or not str(city).strip():
        return Response.json(
            {"error": "Missing or empty 'city' query parameter"},
            status=400,
        )
    city = str(city).strip()
    
    country_raw = (query.get("country") or [None])[0]
    country = str(country_raw).strip().upper() if country_raw else None
    if country and len(country) != 2:
        country = None  # 僅接受兩碼 ISO 國家代碼

    try:
        cities = await cities_service.search_cities(city, country)
    except ServiceError as e:
        return Response.json(
            {"error": "Database query failed", "detail": str(e)},
            status=500,
        )

    if not cities:
        return Response.json(
            {"error": "No city found", "query": city, "country": country},
            status=404,
        )

    return Response.json({"cities": cities})


async def handle_weather(query: Dict[str, Any], weather_service: WeatherService) -> Response:
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

    try:
        data = await weather_service.get_weather(lat_f, lon_f)
        return Response.json(data)
    except RateLimitError as e:
        return Response.json({"error": str(e)}, status=429)
    except AuthError as e:
        # 為了相容原始碼的回應，雖然是 AuthError，但原來回傳 503 和 invalid key 的訊息
        return Response.json({"error": "Invalid OpenWeatherMap API key"}, status=503)
    except UpstreamError as e:
        # 原本有幾種狀態，這裡統一用 UpstreamError 捕捉。
        # 如果是 HTTP 非 200/401/429 的情況，原來回 502。
        # 如果是 JSON 解析失敗也是回 502。
        # 上述都在 weather_service 裡轉成 UpstreamError 了。
        return Response.json({"error": str(e)}, status=502)
    except Exception as e:
        return Response.json({"error": "Internal server error", "detail": str(e)}, status=500)
