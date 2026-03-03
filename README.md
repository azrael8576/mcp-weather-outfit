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
npm install
uv sync
```

## 環境變數

複製 `.env.example` 為 `.env` 並填入：

- `OPEN_WEATHER_KEY` — OpenWeatherMap API 金鑰

Cloudflare 環境（本機除錯用）可放在 `.dev.vars`（勿提交）：

```
OPEN_WEATHER_KEY=your_key_here
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

## Python Worker API（天氣後端）

提供給 TS MCP Agent 呼叫的內部 API（需先完成 D1 匯入與設定 `OPEN_WEATHER_KEY`）：

- `GET /api/coordinates?city=<英文名稱>&country=<選填，ISO 兩碼>` — 查詢城市經緯度；有 `country` 時只回傳精確一筆。回傳 `{ "cities": [ ... ] }`；找不到則 404。
- `GET /api/weather?lat=<緯度>&lon=<經度>` — 呼叫 OpenWeatherMap，回傳即時天氣（含錯誤處理：逾時、429 用量限制、401/502）。

## 本機執行

- **Python Worker（天氣 API）**：在專案根目錄執行 `uv run pywrangler dev` 或 `npx wrangler dev`（需先建立 D1 並將 `database_id` 填入根目錄 `wrangler.toml`）。
- **TS MCP 伺服器**：`cd workers/ts-agent && npm install && npm run dev`，MCP 端點為 `http://localhost:8787/mcp`（埠號以終端機輸出為準）。使用 MCP Inspector 時輸入此 URL 即可連線。

## 如何測試（ step-by-step）

### 一、前置（只需做一次）

1. **建立 D1 並寫入 database_id**  
   ```bash
   npx wrangler d1 create mcp-weather-db
   ```  
   把輸出裡的 `database_id` 填進專案根目錄的 `wrangler.toml`，取代 `REPLACE_AFTER_D1_CREATE`。

2. **建立資料表**  
   ```bash
   npx wrangler d1 execute mcp-weather-db --remote --file=./schema.sql
   ```

3. **匯入城市資料**  
   ```bash
   uv run python scripts/import_cities_to_d1.py
   for f in d1_chunks/insert_*.sql; do npx wrangler d1 execute mcp-weather-db --remote --file="$f"; done
   ```  
   （迴圈會跑一陣子，約 42 個檔案。）

4. **本機開發專用：匯入「本地 D1」**（若不想註冊 workers.dev，用這步讓 `npx wrangler dev` 連到有資料的本地 D1）  
   ```bash
   npx wrangler d1 execute mcp-weather-db --local --file=./schema.sql
   for f in d1_chunks/insert_*.sql; do npx wrangler d1 execute mcp-weather-db --local --file="$f"; done
   ```  
   跑完後，本機 `npx wrangler dev` 會使用這份本地 D1，無需 workers.dev 或 `--remote`。

5. **本機環境變數**  
   - 專案**根目錄**新增 `.dev.vars`（給 Python Worker）：  
     `OPEN_WEATHER_KEY=你的OpenWeatherMap金鑰`  
   - **workers/ts-agent/** 底下新增 `.dev.vars`（給 TS MCP）：  
     `PYTHON_WORKER_URL=http://localhost:8788`  
     （埠號等下面啟動 Python Worker 後再對照修改。）

### 二、每次測試：開兩個終端機 + Inspector

**終端機 1 — Python Worker（天氣 API）**  
在專案根目錄執行（需先完成上方「本機開發專用：匯入本地 D1」步驟，本機 dev 才會連到有城市資料的本地 D1）：
```bash
npx wrangler dev
```
看輸出裡的埠號（例如 `http://localhost:8788`）。若埠號不是 8788，請把 `workers/ts-agent/.dev.vars` 的 `PYTHON_WORKER_URL` 改成對應的 `http://localhost:<埠號>`。

**終端機 2 — TS MCP 伺服器**  
```bash
cd workers/ts-agent && npm install && npm run dev
```
記下埠號（例如 8787）。

**終端機 3 — MCP Inspector**  
```bash
npx @modelcontextprotocol/inspector@latest
```
瀏覽器會打開 Inspector。在「Server URL」輸入：`http://localhost:8787/mcp`（改成你在終端機 2 看到的埠號），按 **Connect**。

### 三、在 Inspector 裡驗證（無對話框，只能手動呼叫 Tool）

**MCP Inspector 沒有聊天對話框**，只能手動選擇 Tool、填入參數後執行。要測試「東京」「台北」等自然語言，需在**有對話的 AI 應用**裡（見下方「哪裡有對話框？」）。

在 Inspector 中建議這樣測：

- **Tools**：選 `search_city_coordinates`，手動輸入 `city: "Tokyo"`、`country: "JP"`（模擬 LLM 把「東京」轉成英文+國家後呼叫），應得到一筆經緯度。再選 `get_weather`，把剛拿到的 `lat`、`lon` 填入即可取得天氣。
- **Resources**：選 `outfit_guidelines` 或 URI `res://outfit_guidelines`，讀取後應看到穿搭指南文字。
- **Prompts**：選 `weather_outfit_advisor`，取得 prompt 後會帶入「先查座標 → 查天氣 → 讀指南 → 產出穿搭建議」的指示。

### 哪裡有對話框？（使用者輸入「東京的天氣」的地方）

「在對話裡輸入『東京的天氣』」指的是**使用本 MCP 的 AI 應用**的聊天介面，不是 MCP Inspector：

- **Cloudflare Agents**：部署 TS MCP 後，在 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → 你的 Agent → 設定「遠端 MCP」為你的 MCP 端點。在該 Agent 的**聊天視窗**輸入「東京的天氣」「查台北天氣」，Agent（LLM）會自動把「東京」轉成 Tokyo + JP 並呼叫你的 tools。
- **其他 MCP 客戶端**：例如 Claude Desktop、Cursor 等若已設定連到你的 MCP 端點，則在該程式的**對話框**輸入即可。

本機僅用 MCP Inspector 時，沒有這類對話框，需如上所述手動傳 `city` / `country` 測試。

### 若 get_weather 出現 HTTP 404 或「Invalid OAuth」「&lt;!DOCTYPE」等 HTML 錯誤

表示 **TS Agent 沒有連到 Python Worker**，而是連到別台（例如 OAuth 登入頁），所以回傳 HTML 而非 JSON。請檢查：

1. **Python Worker 是否有啟動**：在專案根目錄執行 `npx wrangler dev`，確認終端顯示類似 `Ready on http://localhost:8788`（埠號以你畫面為準）。
2. **TS Agent 的 PYTHON_WORKER_URL 是否正確**：在 `workers/ts-agent/.dev.vars` 設為 Python Worker 的網址，且**不要**含結尾斜線，例如：
   ```bash
   PYTHON_WORKER_URL=http://localhost:8788
   ```
   埠號要與終端機 1 的 Python Worker 一致。
3. 若同時跑兩個服務，請確認終端機 1 是 Python Worker（根目錄 `wrangler dev`）、終端機 2 是 TS Agent（`workers/ts-agent` 底下 `npm run dev`），兩者都保持運行再測 `get_weather`。

## 呼叫流程範例（MCP Inspector）

先啟動 Python Worker 與 TS MCP，再用 MCP Inspector 連到 TS MCP 的 `/mcp` 端點。在 Inspector 內手動呼叫 Tools（如 `search_city_coordinates` 傳 `city: "Tokyo"`, `country: "JP"`）、讀取 Resources、取得 Prompts。

## 部署（Cloudflare Workers）

需先登入 Cloudflare：`npx wrangler login`（或設定環境變數 `CLOUDFLARE_API_TOKEN`）。專案內 `wrangler.toml` 已設定 Worker 名稱與 D1 `database_id`，可直接依下列步驟部署。

### 1. Python Worker（天氣 API）

在**專案根目錄**執行：

```bash
# 設定 OpenWeatherMap API Key（部署用 Secret，非 .env）
npx wrangler secret put OPEN_WEATHER_KEY
# 依提示貼上你的 OpenWeatherMap API Key

# 部署
npx wrangler deploy
```

部署成功後終端會顯示 URL，例如：`https://mcp-weather-api.<你的帳號>.workers.dev`。**請複製此 URL**，下一步會用到。

### 2. TS MCP 伺服器

在 **`workers/ts-agent`** 目錄執行：

```bash
cd workers/ts-agent

# 設定 Python Worker 的對外 URL（把下面換成你上一步的實際 URL）
npx wrangler secret put PYTHON_WORKER_URL
# 依提示輸入：https://mcp-weather-api.<你的帳號>.workers.dev（勿加結尾斜線）

# 部署
npm run deploy
```

MCP 端點為：`https://mcp-ts-agent.<你的帳號>.workers.dev/mcp`。

### 3. Cloudflare Agents 遠端 MCP

在 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → 你的 Agent → 設定「遠端 MCP」URL 為：

`https://mcp-ts-agent.<你的帳號>.workers.dev/mcp`

即可讓該 Agent 使用本 MCP 的 tools、resources、prompts。

### 4. 在 Cursor 裡使用此 MCP

部署完成後，可在 Cursor 中連到你的 MCP，讓 AI 助手能呼叫查座標、查天氣、讀穿搭指南。

**方式一：專案已內建設定（推薦）**  
本專案已包含 `.cursor/mcp.json`，MCP URL 為 `https://mcp-ts-agent.weihe.workers.dev/mcp`。若你部署到不同網域，請編輯此檔中的 `url`。

1. 重新載入 Cursor 視窗：`Cmd + Shift + P`（Mac）或 `Ctrl + Shift + P`（Windows）→ 輸入 **Reload Window** → Enter。
2. 開啟 **Cursor Settings**（`Cmd + ,` / `Ctrl + ,`）→ **Features** → **MCP**，確認專案的 MCP 已出現並為已連線。
3. 在聊天或 Composer 中即可請 AI 使用「查東京天氣」「台北穿搭建議」等，AI 會透過 MCP 呼叫 `search_city_coordinates`、`get_weather` 與讀取 `outfit_guidelines`。

**方式二：手動新增**  
若未使用專案內建的 `.cursor/mcp.json`，可改在 Cursor 設定中手動新增 MCP Server：

- **Transport**：Streamable HTTP（或 SSE）
- **URL**：`https://mcp-ts-agent.weihe.workers.dev/mcp`（依你的部署子網域修改）

新增後重新載入 Cursor 視窗再使用。

---

### 已啟用：以 Cloudflare Access for SaaS 保護 MCP

本專案的 TS MCP Worker 已實作 Cloudflare Access (SSO/OIDC) 保護，確保只有經過驗證的使用者才能存取 MCP 端點。

#### 設定步驟

1. **建立 Zero Trust 組織**：在 Cloudflare Dashboard 中進入 Zero Trust，並設定 One-time PIN 或第三方 IdP。
2. **建立 Access for SaaS 應用**：
   - 在 Zero Trust → Access → Applications 新增 SaaS 應用。
   - 類型選擇 **OIDC**。
   - 設定 Redirect URI 為 `https://mcp-ts-agent.<你的子網域>.workers.dev/callback`。
   - 完成後，取得以下資訊：`client_id`、`client_secret`，以及 Token / Authorization / JWKS 的端點 URL。
3. **建立 KV Namespace**：
   - 執行 `npx wrangler kv:namespace create OAUTH_KV`
   - 將產生的 `id` 填入 `workers/ts-agent/wrangler.toml` 中的 `[[kv_namespaces]]` 區塊。
4. **設定 Worker 的 Secrets**：
   - 在 `workers/ts-agent` 目錄下，使用 `npx wrangler secret put <變數名稱>` 依序設定以下變數：
     - `ACCESS_CLIENT_ID`: 步驟 2 取得的 Client ID
     - `ACCESS_CLIENT_SECRET`: 步驟 2 取得的 Client Secret
     - `ACCESS_TOKEN_URL`: 例如 `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client_id>/token`
     - `ACCESS_AUTHORIZATION_URL`: 例如 `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client_id>/authorization`
     - `ACCESS_JWKS_URL`: 例如 `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/certs`
     - `COOKIE_ENCRYPTION_KEY`: 產生一組 32 bytes 的 Hex 字串（可使用 `openssl rand -hex 32` 產生）

完成上述設定後，重新部署 TS MCP Worker。存取 MCP 端點時，若未帶有有效的 Cookie，將會回傳 `401 Unauthorized`。若要取得 Cookie，請先透過瀏覽器存取 OAuth 授權流程（例如自行實作登入按鈕重導向至 `ACCESS_AUTHORIZATION_URL`），登入成功後會跳轉回 `/callback` 並自動設定 Cookie。
