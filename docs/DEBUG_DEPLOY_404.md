# 部署後 MCP 查詢 404 除錯

當 Cursor 連到**已部署**的 MCP（`https://mcp-ts-agent.weihe.workers.dev/mcp`）並呼叫 `search_city_coordinates` 時出現「後端回傳非 JSON（HTTP 404）」時，代表 **TS Agent 向 Python Worker 發出的請求得到 404**（且回傳是 HTML 或非 JSON，不是「查無城市」的 JSON 404）。

## 可能原因

1. **同帳號的 Worker-to-Worker Fetch 被阻擋 (Error 1042)**
   當 TS Agent 與 Python Worker 部署在同一個 Cloudflare 帳號下時，若直接用 URL fetch，Cloudflare 預設會阻擋此內部請求並回傳 404 HTML。
   **解法**：在 `workers/ts-agent/wrangler.toml` 中加上相容性標記：
   `compatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]`

2. **部署的 TS Agent 沒有設定 `PYTHON_WORKER_URL`**  
   未設定時，請求會打到 TS Agent 自己的 `/api/coordinates`，該 Worker 沒有此路由 → Cloudflare 回 404（非 JSON）。

3. **`PYTHON_WORKER_URL` 設錯**  
   例如仍為 `http://localhost:8788`、打錯字、或指到未部署的 Worker 網址。

4. **Python Worker 未部署或未啟動**  
   TS Agent 指去的網址根本沒有跑 mcp-weather-api。

5. **Python Worker 已部署但 D1 沒資料**  
   若 D1 查不到城市，Python Worker 會回 **JSON** 404（`{"error":"No city found",...}`），錯誤訊息會是「找不到城市」而非「後端回傳非 JSON」；所以若看到「後端回傳非 JSON（HTTP 404）」通常是 1 或 2 或 3。

---

## 除錯步驟（依序做）

### 1. 確認 Python Worker 已部署且可連

在專案**根目錄**執行：

```bash
npx wrangler deploy
```

終端會顯示部署後的 URL，例如：

```text
Published mcp-weather-api (1.23 sec)
  https://mcp-weather-api.<你的帳號>.workers.dev
```

記下此 URL（以下用 `https://mcp-weather-api.weihe.workers.dev` 當範例）。

手動測試座標 API（請把網址換成你的）：

```bash
curl "https://mcp-weather-api.weihe.workers.dev/api/coordinates?city=Taipei&country=TW"
```

- **若回傳 JSON**（例如 `{"cities":[{"name":"Taipei",...}]}` 或 `{"error":"No city found",...}`）→ Python Worker 正常，問題多半在 TS Agent 的 `PYTHON_WORKER_URL`。
- **若 404 或 HTML** → 先解決 Python Worker 部署或路由（或 D1 匯入）。

可順便測健康檢查：

```bash
curl "https://mcp-weather-api.weihe.workers.dev/health"
# 應回傳 {"ok":true,"service":"mcp-weather-api"}
```

### 2. 確認 TS Agent 的 `PYTHON_WORKER_URL` 已設定

在 **`workers/ts-agent`** 目錄執行：

```bash
cd workers/ts-agent
npx wrangler secret put PYTHON_WORKER_URL
```

依提示輸入**上一步的 Python Worker URL**，且**不要**加結尾斜線，例如：

```text
https://mcp-weather-api.weihe.workers.dev
```

若之前沒設過或設錯，設好後需重新部署 TS Agent（見下一步）。

### 3. 用 /health 檢查 TS Agent 是否已接上 Python Worker

TS Agent 提供 `/health` 端點，可檢查是否有設定後端 URL（不顯示實際 URL，只顯示是否已設定）。

先重新部署 TS Agent（在 `workers/ts-agent` 目錄）：

```bash
npm run deploy
```

然後：

```bash
curl "https://mcp-ts-agent.weihe.workers.dev/health"
```

預期回傳類似：

```json
{"ok":true,"service":"mcp-ts-agent","python_worker_configured":true}
```

- 若 `python_worker_configured` 為 **false** → 表示部署環境沒有讀到 `PYTHON_WORKER_URL`，請再執行一次 `npx wrangler secret put PYTHON_WORKER_URL` 並重新 deploy。
- 若為 **true** 但 MCP 仍 404 → 再確認步驟 1 的 Python Worker URL 是否與 secret 完全一致（含 https、無尾斜線、無多餘路徑）。

### 4. 再測一次 MCP

在 Cursor 中重新載入視窗後，再試「查台北穿搭建議」或直接使用 MCP 的 `search_city_coordinates`（city: Taipei, country: TW）。

---

## 快速對照

| 狀況 | 處理 |
|------|------|
| `/health` 回傳 `python_worker_configured: false` | 在 `workers/ts-agent` 執行 `npx wrangler secret put PYTHON_WORKER_URL`，再 deploy |
| Python Worker 的 `/api/coordinates?...` 回 404 或 HTML | 檢查根目錄 `npx wrangler deploy` 是否成功、D1 是否已建立並匯入城市資料 |
| Python 回 JSON `{"error":"No city found"}` | 代表連線正常，是資料庫沒有該城市，需檢查 D1 匯入或查詢參數（英文城市名+國家碼） |
