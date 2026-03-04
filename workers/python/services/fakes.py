from typing import List, Dict, Any, Optional
from ..core.exceptions import RateLimitError, AuthError, UpstreamError

class FakeWeatherService:
    def __init__(self):
        self._responses: Dict[str, Any] = {}
        self._error: Optional[Exception] = None
        self.calls: List[tuple[float, float]] = []

    def set_weather(self, lat: float, lon: float, response: Dict[str, Any]):
        """Test hook to set weather response for coordinates."""
        self._responses[f"{lat},{lon}"] = response

    def set_error(self, error: Exception):
        """Test hook to simulate an error."""
        self._error = error

    async def get_weather(self, lat: float, lon: float) -> Dict[str, Any]:
        self.calls.append((lat, lon))
        if self._error:
            raise self._error
        key = f"{lat},{lon}"
        if key in self._responses:
            return self._responses[key]
        return {"weather": [{"main": "Clear"}], "main": {"temp": 20}}


class FakeCitiesService:
    def __init__(self):
        self._cities: List[Dict[str, Any]] = []
        self._error: Optional[Exception] = None
        self.calls: List[tuple[str, Optional[str]]] = []

    def add_city(self, city_data: Dict[str, Any]):
        """Test hook to add a mock city."""
        self._cities.append(city_data)

    def set_error(self, error: Exception):
        """Test hook to simulate an error."""
        self._error = error

    async def search_cities(self, city: str, country: Optional[str] = None) -> List[Dict[str, Any]]:
        self.calls.append((city, country))
        if self._error:
            raise self._error
        
        results = []
        for c in self._cities:
            # Simple fake matching logic
            if city.lower() in c.get("name", "").lower():
                if country is None or country.lower() == c.get("country", "").lower():
                    results.append(c)
        return results
