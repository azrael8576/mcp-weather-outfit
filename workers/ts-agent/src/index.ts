/// <reference path="../worker-configuration.d.ts" />
import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OUTFIT_GUIDELINES_TEXT } from "./outfit-guidelines.js";
import { createRemoteJWKSet, jwtVerify } from "jose";

async function callPythonWorker(
  baseUrl: string,
  path: string,
  params: Record<string, string>
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const url = new URL(path, baseUrl.replace(/\/$/, ""));
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url.toString(), { method: "GET" });
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const text = await res.text();
    if (!isJson || text.trimStart().startsWith("<")) {
      let hostHint = "";
      try {
        if (baseUrl) hostHint = ` 目前請求的 host：${new URL(baseUrl).hostname}`;
      } catch {
        hostHint = " （PYTHON_WORKER_URL 格式可能有誤）";
      }
      const hint =
        "請確認 PYTHON_WORKER_URL 正確：本機開發用 http://localhost:8788、部署環境用 https://mcp-weather-api.xxx.workers.dev（無尾斜線），且該 Worker 已部署／已啟動。";
      return {
        ok: false,
        error: `後端回傳非 JSON（HTTP ${res.status}），可能連錯網址或 Worker 未啟動。${hostHint} ${hint}`,
      };
    }
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function createServer(env: Env): McpServer {
  const server = new McpServer({
    name: "Weather & Outfit MCP",
    version: "1.0.0",
  });

  const baseUrl = env.PYTHON_WORKER_URL ?? "";

  // Resource：靜態穿搭指南，供 LLM 讀取後依天氣給建議
  server.registerResource(
    "outfit_guidelines",
    "res://outfit_guidelines",
    {},
    async (uri, _extra) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "text/plain",
          text: OUTFIT_GUIDELINES_TEXT,
        },
      ],
    })
  );

  server.registerTool(
    "search_city_coordinates",
    {
      description:
        "查詢城市經緯度（供後續取得天氣）。**你必須先將使用者輸入的城市（任意語言，如「東京」）轉成英文城市名**（如 Tokyo），並在可推斷時傳入 ISO 國家代碼（如 JP）以取得精確一筆結果。資料庫僅有英文城市名。",
      inputSchema: {
        city: z.string().describe("英文城市名稱，例如 Tokyo、Taipei（請先將使用者說的「東京」「台北」等轉成英文）"),
        country: z.string().optional().describe("ISO 3166-1 兩碼國家代碼，例如 JP、TW、US，用於精確匹配單一城市"),
      },
    },
    async ({ city, country }, _extra) => {
      if (!baseUrl) {
        return {
          content: [
            {
              type: "text",
              text: "錯誤：未設定 PYTHON_WORKER_URL，無法查詢城市座標。",
            },
          ],
          isError: true,
        };
      }
      const params: Record<string, string> = { city: city.trim() };
      if (country?.trim()) params.country = country.trim().toUpperCase().slice(0, 2);
      const result = await callPythonWorker(baseUrl, "/api/coordinates", params);
      if (!result.ok) {
        return {
          content: [{ type: "text", text: `查詢失敗：${result.error}` }],
          isError: true,
        };
      }
      const body = result.data as { cities?: Array<{ name: string; country: string; lon: number; lat: number }> };
      const cities = body.cities ?? [];
      if (cities.length === 0) {
        return {
          content: [{ type: "text", text: `找不到城市：「${city}」${country ? ` (${country})` : ""}` }],
          isError: true,
        };
      }
      const summary = cities
        .slice(0, 10)
        .map((c) => `${c.name} (${c.country}): lat=${c.lat}, lon=${c.lon}`)
        .join("\n");
      return {
        content: [{ type: "text", text: summary }],
      };
    }
  );

  server.registerTool(
    "get_weather",
    {
      description: "依經緯度取得該地即時天氣（來自 OpenWeatherMap）。",
      inputSchema: {
        lat: z.number().describe("緯度"),
        lon: z.number().describe("經度"),
      },
    },
    async ({ lat, lon }, _extra) => {
      if (!baseUrl) {
        return {
          content: [
            {
              type: "text",
              text: "錯誤：未設定 PYTHON_WORKER_URL，無法取得天氣。",
            },
          ],
          isError: true,
        };
      }
      const result = await callPythonWorker(baseUrl, "/api/weather", {
        lat: String(lat),
        lon: String(lon),
      });
      if (!result.ok) {
        return {
          content: [{ type: "text", text: `取得天氣失敗：${result.error}` }],
          isError: true,
        };
      }
      const w = result.data as {
        name?: string;
        coord?: { lat?: number; lon?: number };
        main?: {
          temp?: number;
          feels_like?: number;
          temp_min?: number;
          temp_max?: number;
          pressure?: number;
          humidity?: number;
          sea_level?: number;
          grnd_level?: number;
        };
        weather?: Array<{ id?: number; main?: string; description?: string; icon?: string }>;
        visibility?: number;
        wind?: { speed?: number; deg?: number; gust?: number };
        clouds?: { all?: number };
        rain?: { "1h"?: number; "3h"?: number };
        snow?: { "1h"?: number; "3h"?: number };
        sys?: { country?: string; sunrise?: number; sunset?: number };
        timezone?: number;
        dt?: number;
      };
      const fmt = (n: number | undefined, unit: string) =>
        n != null && Number.isFinite(n) ? `${n} ${unit}` : "—";
      const time = (ts: number | undefined) =>
        ts != null ? new Date(ts * 1000).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : "—";
      const main = w.main ?? {};
      const weather0 = w.weather?.[0];
      const wind = w.wind ?? {};
      const sys = w.sys ?? {};
      const lines: string[] = [
        "## 地點",
        `城市: ${w.name ?? "—"} (${sys.country ?? "—"})`,
        `經緯度: ${w.coord?.lat != null && w.coord?.lon != null ? `${w.coord.lat}, ${w.coord.lon}` : "—"}`,
        "",
        "## 氣溫與體感",
        `目前氣溫: ${fmt(main.temp, "°C")}`,
        `體感溫度: ${fmt(main.feels_like, "°C")}`,
        `最低 / 最高: ${fmt(main.temp_min, "°C")} / ${fmt(main.temp_max, "°C")}`,
        "",
        "## 天氣現象",
        `概況: ${weather0?.main ?? "—"} (${weather0?.description ?? "—"})`,
        `降雨 (1h/3h): ${fmt((w.rain ?? {})["1h"], "mm")} / ${fmt((w.rain ?? {})["3h"], "mm")}`,
        `降雪 (1h/3h): ${fmt((w.snow ?? {})["1h"], "mm")} / ${fmt((w.snow ?? {})["3h"], "mm")}`,
        "",
        "## 大氣與風",
        `氣壓: ${fmt(main.pressure, "hPa")} (海平面: ${fmt(main.sea_level, "hPa")}, 地面: ${fmt(main.grnd_level, "hPa")})`,
        `濕度: ${fmt(main.humidity, "%")}`,
        `能見度: ${fmt(w.visibility, "m")}`,
        `風速: ${fmt(wind.speed, "m/s")}，風向: ${fmt(wind.deg, "°")}，陣風: ${fmt(wind.gust, "m/s")}`,
        `雲量: ${fmt(w.clouds?.all, "%")}`,
        "",
        "## 日出日落",
        `日出: ${time(sys.sunrise)}，日落: ${time(sys.sunset)}`,
      ];
      const text = lines.join("\n");
      return { content: [{ type: "text", text }] };
    }
  );

  server.registerPrompt(
    "weather_outfit_advisor",
    {
      description:
        "你是一位天氣穿搭顧問。請先將使用者提到的城市（任意語言，如「東京」「台北」）轉成英文名稱與國家代碼，再用 search_city_coordinates 查座標、get_weather 取得天氣，最後依 res://outfit_guidelines 產出穿搭建議。",
    },
    async (_args, _extra) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `你是一位天氣穿搭顧問。請依下列步驟回覆使用者：

1. **辨識並轉換城市**：使用者可能用任意語言輸入（如「東京」「台北」「Tokyo」）。你必須先將城市名稱轉成**英文**（例：東京→Tokyo、台北→Taipei），並推斷 **ISO 兩碼國家代碼**（例：日本→JP、台灣→TW）。資料庫僅有英文城市名，未轉換會查不到。

2. **查詢座標**：呼叫 Tool「search_city_coordinates」，參數為 **city**（英文城市名）與 **country**（兩碼，如 JP、TW）。有 country 時會回傳精確一筆，避免多筆混淆。

3. **取得天氣**：用回傳的經緯度呼叫 Tool「get_weather」。

4. **穿搭建議**：讀取 Resource「outfit_guidelines」（URI: res://outfit_guidelines），依天氣與指南給出簡潔建議。

若找不到城市或無法取得天氣，請友善說明，並可建議使用者改輸入英文城市名或加上國家。`,
          },
        },
      ],
    })
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // OAuth Callback 處理邏輯
    if (url.pathname === "/callback" || url.pathname === "/callback/") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing authorization code", { status: 400 });
      }

      try {
        // 1. 向 Cloudflare Access 交換 Token
        const tokenRes = await fetch(env.ACCESS_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: env.ACCESS_CLIENT_ID,
            client_secret: env.ACCESS_CLIENT_SECRET,
            grant_type: "authorization_code",
            code,
            redirect_uri: `${url.origin}/callback`,
          }),
        });

        if (!tokenRes.ok) {
          const errorText = await tokenRes.text();
          return new Response(`Failed to exchange token: ${errorText}`, { status: 500 });
        }

        const tokenData = await tokenRes.json() as { id_token?: string; access_token?: string };
        const tokenToStore = tokenData.id_token || tokenData.access_token;

        if (!tokenToStore) {
          return new Response("No token received from provider", { status: 500 });
        }

        // 2. 產生 Session ID 並儲存 Token 到 KV (設定 24 小時過期)
        const sessionId = crypto.randomUUID();
        await env.OAUTH_KV.put(`session:${sessionId}`, tokenToStore, { expirationTtl: 86400 });

        // 3. 將 Session ID 加密後寫入 Cookie
        // 將 hex string 轉為 Uint8Array
        const keyHex = env.COOKIE_ENCRYPTION_KEY;
        const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const cryptoKey = await crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "AES-GCM" },
          false,
          ["encrypt"]
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedSessionId = new TextEncoder().encode(sessionId);
        const ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          cryptoKey,
          encodedSessionId
        );

        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const cipherHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('');
        const encryptedCookieValue = `${ivHex}:${cipherHex}`;

        // 4. 設定 Cookie 並重導向回首頁或 MCP 端點
        const headers = new Headers();
        headers.append(
          "Set-Cookie",
          `CF_Authorization=${encryptedCookieValue}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=86400`
        );
        headers.append("Location", "/");

        return new Response("Login successful! You can now use the MCP.", {
          status: 302,
          headers,
        });
      } catch (error) {
        return new Response(`Internal Server Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
      }
    }

    // 健康檢查端點：檢查 PYTHON_WORKER_URL 是否已設定（部署後 404 時可先 curl /health）
    if (url.pathname === "/health" || url.pathname === "/health/") {
      const configured = Boolean(env.PYTHON_WORKER_URL?.trim());
      return Response.json({
        ok: true,
        service: "mcp-ts-agent",
        python_worker_configured: configured,
      });
    }
    if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") {
      return new Response("Not Found", { status: 404 });
    }

    // 驗證邏輯 (Middleware)
    const cookieHeader = request.headers.get("Cookie") || "";
    const match = cookieHeader.match(/CF_Authorization=([^;]+)/);
    
    if (!match) {
      return new Response("Unauthorized: Missing Cookie", { status: 401 });
    }

    const encryptedCookieValue = match[1];
    
    try {
      // 1. 解密 Cookie 取得 Session ID
      const [ivHex, cipherHex] = encryptedCookieValue.split(":");
      if (!ivHex || !cipherHex) throw new Error("Invalid cookie format");

      const keyHex = env.COOKIE_ENCRYPTION_KEY;
      const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const ciphertext = new Uint8Array(cipherHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        ciphertext
      );
      const sessionId = new TextDecoder().decode(decrypted);

      // 2. 從 KV 取得 Token
      const token = await env.OAUTH_KV.get(`session:${sessionId}`);
      if (!token) {
        return new Response("Unauthorized: Session expired or invalid", { status: 401 });
      }

      // 3. 驗證 JWT Token (使用 JWKS)
      const jwksUrl = new URL(env.ACCESS_JWKS_URL);
      const JWKS = createRemoteJWKSet(jwksUrl);
      
      // jwtVerify 會自動驗證過期時間等
      await jwtVerify(token, JWKS, {
        issuer: new URL(env.ACCESS_JWKS_URL).origin, // Cloudflare Access issuer is usually the team domain
        audience: env.ACCESS_CLIENT_ID,
      });

    } catch (error) {
      return new Response(`Unauthorized: ${error instanceof Error ? error.message : "Invalid token"}`, { status: 401 });
    }

    const server = createServer(env);
    return createMcpHandler(server.server, { route: "/mcp" })(
      request,
      env,
      ctx
    );
  },
};
