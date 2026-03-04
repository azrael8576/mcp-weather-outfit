import pytest
from handlers import handle_coordinates
from services.fakes import FakeCitiesService
from core.exceptions import ServiceError

@pytest.fixture
def cities_service():
    return FakeCitiesService()

@pytest.mark.asyncio
async def test_given_沒有提供city參數_when_查詢座標_then_回傳400錯誤(cities_service):
    # given
    query = {}
    
    # when
    response = await handle_coordinates(query, cities_service)
    
    # then
    assert response.status == 400
    assert "error" in response.body

@pytest.mark.asyncio
async def test_given_提供的city為空字串_when_查詢座標_then_回傳400錯誤(cities_service):
    # given
    query = {"city": ["   "]}
    
    # when
    response = await handle_coordinates(query, cities_service)
    
    # then
    assert response.status == 400
    assert "error" in response.body

@pytest.mark.asyncio
async def test_given_有效的city與country_when_查詢座標_then_回傳找到的城市(cities_service):
    # given
    cities_service.add_city({
        "id": 1,
        "name": "Taipei",
        "country": "TW",
        "lon": 121.5,
        "lat": 25.0
    })
    query = {"city": ["Taipei"], "country": ["TW"]}
    
    # when
    response = await handle_coordinates(query, cities_service)
    
    # then
    assert response.status == 200
    assert len(response.body["cities"]) == 1
    assert response.body["cities"][0]["name"] == "Taipei"
    assert cities_service.calls[0] == ("Taipei", "TW")

@pytest.mark.asyncio
async def test_given_只提供city未提供country_when_查詢座標_then_使用country為None查詢(cities_service):
    # given
    cities_service.add_city({
        "id": 1,
        "name": "Taipei",
        "country": "TW",
        "lon": 121.5,
        "lat": 25.0
    })
    query = {"city": ["Taipei"]}
    
    # when
    response = await handle_coordinates(query, cities_service)
    
    # then
    assert response.status == 200
    assert len(response.body["cities"]) == 1
    assert cities_service.calls[0] == ("Taipei", None)

@pytest.mark.asyncio
async def test_given_提供非兩碼的country_when_查詢座標_then_忽略該country並以None查詢(cities_service):
    # given
    cities_service.add_city({
        "id": 1,
        "name": "Taipei",
        "country": "TW",
        "lon": 121.5,
        "lat": 25.0
    })
    query = {"city": ["Taipei"], "country": ["USA"]}  # 長度為 3
    
    # when
    response = await handle_coordinates(query, cities_service)
    
    # then
    assert response.status == 200
    assert len(response.body["cities"]) == 1
    # 因為 "USA" 長度 != 2，應被轉為 None
    assert cities_service.calls[0] == ("Taipei", None)

@pytest.mark.asyncio
async def test_given_資料庫查詢發生錯誤_when_查詢座標_then_回傳500錯誤(cities_service):
    # given
    cities_service.set_error(ServiceError("DB connection failed"))
    query = {"city": ["Taipei"]}
    
    # when
    response = await handle_coordinates(query, cities_service)
    
    # then
    assert response.status == 500
    assert "Database query failed" in response.body["error"]

@pytest.mark.asyncio
async def test_given_找不到城市_when_查詢座標_then_回傳404錯誤(cities_service):
    # given
    query = {"city": ["UnknownCity"]}
    
    # when
    response = await handle_coordinates(query, cities_service)
    
    # then
    assert response.status == 404
    assert response.body["error"] == "No city found"
