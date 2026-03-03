#!/usr/bin/env python3
"""
將 city.list.json 轉成供 Cloudflare D1 匯入的 SQL 檔案（分塊輸出）。
使用方式：
  uv run python scripts/import_cities_to_d1.py
  # 會產生 d1_chunks/ 目錄與 schema.sql，再依 README 執行 wrangler d1 execute
"""
from pathlib import Path
import json

# 專案根目錄
ROOT = Path(__file__).resolve().parent.parent
CITY_JSON = ROOT / "city.list.json"
OUT_DIR = ROOT / "d1_chunks"
CHUNK_SIZE = 5000


def escape_sql(s: str) -> str:
    """Escape single quotes for SQL."""
    if s is None:
        return ""
    return str(s).replace("'", "''")


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    print(f"Reading {CITY_JSON}...")
    with open(CITY_JSON, encoding="utf-8") as f:
        cities = json.load(f)
    total = len(cities)
    print(f"Total cities: {total}")

    chunk_num = 0
    written = 0
    out = None
    for i, c in enumerate(cities):
        if i % CHUNK_SIZE == 0:
            if out is not None:
                out.close()
            chunk_num += 1
            path = OUT_DIR / f"insert_{chunk_num:04d}.sql"
            out = open(path, "w", encoding="utf-8")
            print(f"Writing {path.name}...")
        name = c.get("name") or ""
        country = c.get("country") or ""
        coord = c.get("coord") or {}
        lon = coord.get("lon", 0)
        lat = coord.get("lat", 0)
        city_id = c.get("id", 0)
        row = f"INSERT INTO cities (id, name, country, lon, lat) VALUES ({city_id}, '{escape_sql(name)}', '{escape_sql(country)}', {lon}, {lat});\n"
        out.write(row)
        written += 1
    if out is not None:
        out.close()
    print(f"Done. Wrote {written} rows in {chunk_num} chunk(s) under {OUT_DIR}/")
    print("Run: wrangler d1 execute mcp-weather-db --remote --file=./schema.sql")
    print("Then run each: wrangler d1 execute mcp-weather-db --remote --file=./d1_chunks/insert_XXXX.sql")


if __name__ == "__main__":
    main()
