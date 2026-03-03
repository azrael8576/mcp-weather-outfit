# MCP 天氣與穿搭建議伺服器 (CS146S Week 3)

基於 Cloudflare Workers + D1 的 MCP 伺服器，提供天氣查詢與穿搭建議（Tools、Resources、Prompts）。

## 專案結構

- `workers/python/` — Python Worker：D1 城市查詢、OpenWeatherMap API、錯誤處理
- `workers/ts-agent/` — TypeScript MCP 伺服器：SSE、Tools / Resources / Prompts
- `scripts/` — 工具腳本（如將 city.list.json 匯入 D1）
- `schema.sql` — D1 資料表定義

## 環境需求

- Node.js（含 npm）、[uv](https://docs.astral.sh/uv/)
- Cloudflare 帳號（部署與 D1 用）
- [OpenWeatherMap API Key](https://openweathermap.org/api)（天氣 API）

## 安裝

```bash
# 依賴（專案根目錄）
uv sync
```

## 環境變數

複製 `.env.example` 為 `.env` 並填入：

- `OPENWEATHERMAP_API_KEY` — OpenWeatherMap API 金鑰

Cloudflare 環境（本機除錯用）可放在 `.dev.vars`（勿提交）：

```
OPENWEATHERMAP_API_KEY=your_key_here
```

## D1 資料庫設定與匯入

1. **建立 D1 資料庫**（僅需執行一次）：

   ```bash
   npx wrangler d1 create mcp-weather-db
   ```

   輸出會包含 `database_id`，將它填入 `wrangler.toml` 中 `[[d1_databases]]` 的 `database_id = "..."`。

2. **建立資料表**：

   ```bash
   npx wrangler d1 execute mcp-weather-db --remote --file=./schema.sql
   ```

3. **產生並匯入城市資料**（從 `city.list.json` 產生分塊 SQL）：

   ```bash
   uv run python scripts/import_cities_to_d1.py
   ```

   會產生 `d1_chunks/` 目錄。再依序執行（或寫成迴圈）：

   ```bash
   for f in d1_chunks/insert_*.sql; do npx wrangler d1 execute mcp-weather-db --remote --file="$f"; done
   ```

## 本機執行

- **Python Worker（天氣 API）**：`uv run pywrangler dev` 或依 [Cloudflare Python Workers 文件](https://developers.cloudflare.com/workers/languages/python/) 執行。
- **TS MCP 伺服器**：見 `workers/ts-agent/` 內說明（階段 3、4 實作後補上）。

## 呼叫流程範例（MCP Inspector）

1. 執行 `npx @modelcontextprotocol/inspector@latest`
2. 輸入 MCP 伺服器位址（本機例如 `http://127.0.0.1:8080/sse`，依實際埠與路徑調整）
3. 在 Inspector 中可：
   - 使用 **Tools**：`search_city_coordinates`、`get_weather`
   - 讀取 **Resource**：`outfit_guidelines`
   - 使用 **Prompt**：`weather_outfit_advisor`

（上述端點與埠號將在 TS Agent 實作完成後於 README 與 writeup 中補齊。）
