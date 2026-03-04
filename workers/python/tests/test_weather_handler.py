import pytest
from ..handlers import handle_weather
from ..services.fakes import FakeWeatherService
from ..core.exceptions import RateLimitError, AuthError, UpstreamError

@pytest.fixture
def weather_service():
    return FakeWeatherService()

@pytest.mark.asyncio
async def test_given_沒有提供經緯度_when_請求天氣_then_回傳400錯誤(weather_service):
    # given
    query = {}
    
    # when
    response = await handle_weather(query, weather_service)
    
    # then
    assert response.status == 400
    assert "Missing 'lat' or 'lon'" in response.body["error"]

@pytest.mark.asyncio
async def test_given_非數值的經緯度_when_請求天氣_then_回傳400錯誤(weather_service):
    # given
    query = {"lat": ["abc"], "lon": ["def"]}
    
    # when
    response = await handle_weather(query, weather_service)
    
    # then
    assert response.status == 400
    assert "Invalid lat or lon" in response.body["error"]

@pytest.mark.asyncio
async def test_given_正確的經緯度_when_請求天氣_then_回傳天氣資料(weather_service):
    # given
    fake_data = {"weather": [{"main": "Rain"}], "main": {"temp": 15}}
    weather_service.set_weather(25.0, 121.5, fake_data)
    query = {"lat": ["25.0"], "lon": ["121.5"]}
    
    # when
    response = await handle_weather(query, weather_service)
    
    # then
    assert response.status == 200
    assert response.body["weather"][0]["main"] == "Rain"
    assert weather_service.calls[0] == (25.0, 121.5)

@pytest.mark.asyncio
async def test_given_API達到呼叫上限_when_請求天氣_then_回傳429錯誤(weather_service):
    # given
    weather_service.set_error(RateLimitError("Rate limit exceeded"))
    query = {"lat": ["25.0"], "lon": ["121.5"]}
    
    # when
    response = await handle_weather(query, weather_service)
    
    # then
    assert response.status == 429
    assert "Rate limit exceeded" in response.body["error"]

@pytest.mark.asyncio
async def test_given_API金鑰無效_when_請求天氣_then_回傳503錯誤(weather_service):
    # given
    weather_service.set_error(AuthError("Invalid API key"))
    query = {"lat": ["25.0"], "lon": ["121.5"]}
    
    # when
    response = await handle_weather(query, weather_service)
    
    # then
    assert response.status == 503
    assert response.body["error"] == "Invalid OpenWeatherMap API key"

@pytest.mark.asyncio
async def test_given_上游天氣API回傳錯誤_when_請求天氣_then_回傳502錯誤(weather_service):
    # given
    weather_service.set_error(UpstreamError("API returned status 500"))
    query = {"lat": ["25.0"], "lon": ["121.5"]}
    
    # when
    response = await handle_weather(query, weather_service)
    
    # then
    assert response.status == 502
    assert "API returned status 500" in response.body["error"]
