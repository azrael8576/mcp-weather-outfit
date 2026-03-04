from typing import List, Dict, Any, Optional
from ..core.exceptions import ServiceError

class CloudflareD1CitiesService:
    def __init__(self, db: Any):
        self.db = db

    async def search_cities(self, city: str, country: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            query_exact = city
            query_start = f"{city}%"
            query_contains = f"%{city}%"

            if country:
                sql = """
                    SELECT id, name, country, lon, lat FROM cities 
                    WHERE name LIKE ?1 AND country = ?2 
                    ORDER BY 
                        CASE WHEN name LIKE ?3 THEN 1 
                             WHEN name LIKE ?4 THEN 2 
                             ELSE 3 END ASC,
                        LENGTH(name) ASC
                    LIMIT 1
                """
                stmt = self.db.prepare(sql).bind(query_contains, country, query_exact, query_start)
            else:
                sql = """
                    SELECT id, name, country, lon, lat FROM cities 
                    WHERE name LIKE ?1 
                    ORDER BY 
                        CASE WHEN name LIKE ?2 THEN 1 
                             WHEN name LIKE ?3 THEN 2 
                             ELSE 3 END ASC,
                        LENGTH(name) ASC
                    LIMIT 20
                """
                stmt = self.db.prepare(sql).bind(query_contains, query_exact, query_start)
            result = await stmt.run()
        except Exception as e:
            raise ServiceError(f"Database query failed: {e}")

        rows = getattr(result, "results", []) or []
        
        def row_to_dict(r):
            if hasattr(r, "to_py"):
                return r.to_py()
            return {k: getattr(r, k, r[k] if hasattr(r, "__getitem__") else None) for k in ("id", "name", "country", "lon", "lat")}

        cities = []
        for r in rows:
            d = row_to_dict(r)
            cities.append({
                "id": int(d.get("id", 0)),
                "name": str(d.get("name") or ""),
                "country": str(d.get("country") or ""),
                "lon": float(d.get("lon", 0)),
                "lat": float(d.get("lat", 0)),
            })
        return cities
