from typing import Protocol, List, Dict, Optional, Any

class CitiesService(Protocol):
    async def search_cities(self, city: str, country: Optional[str]) -> List[Dict[str, Any]]:
        """Search cities by name and optional country code."""
        ...

class WeatherService(Protocol):
    async def get_weather(self, lat: float, lon: float) -> Dict[str, Any]:
        """Fetch weather data for given coordinates."""
        ...
