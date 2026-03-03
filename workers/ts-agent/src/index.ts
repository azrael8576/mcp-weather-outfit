/// <reference path="../worker-configuration.d.ts" />
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";
import { OUTFIT_GUIDELINES_TEXT } from "./outfit-guidelines.js";

async function callPythonWorker(
  baseUrl: string,
  path: string,
  params: Record<string, string>
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url.toString(), { method: "GET" });
    const data = await res.json().catch(() => ({}));
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
  server.resource(
    "outfit_guidelines",
    "res://outfit_guidelines",
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "text/plain",
          text: OUTFIT_GUIDELINES_TEXT,
        },
      ],
    })
  );

  server.tool(
    "search_city_coordinates",
    "依城市名稱（英文或母語）查詢經緯度，供後續取得天氣使用。",
    { city: z.string().describe("城市名稱，例如 Tokyo 或 台北") },
    async ({ city }) => {
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
      const result = await callPythonWorker(baseUrl, "/api/coordinates", {
        city: city.trim(),
      });
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
          content: [{ type: "text", text: `找不到城市：「${city}」` }],
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

  server.tool(
    "get_weather",
    "依經緯度取得該地即時天氣（來自 OpenWeatherMap）。",
    {
      lat: z.number().describe("緯度"),
      lon: z.number().describe("經度"),
    },
    async ({ lat, lon }) => {
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
        main?: { temp?: number; feels_like?: number };
        weather?: Array<{ description?: string }>;
        name?: string;
      };
      const temp = w.main?.temp ?? "—";
      const desc = w.weather?.[0]?.description ?? "—";
      const text = `地點: ${w.name ?? "—"}\n氣溫: ${temp}°C\n天氣: ${desc}\n(原始資料可依需要再解析)`;
      return { content: [{ type: "text", text }] };
    }
  );

  server.prompt(
    "weather_outfit_advisor",
    "你是一位天氣穿搭顧問。請先使用 search_city_coordinates 查詢使用者提到的城市座標，再用 get_weather 取得該地天氣，最後讀取 res://outfit_guidelines 資源，依指南產出穿搭建議。",
    {},
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `你是一位天氣穿搭顧問。請依下列步驟回覆使用者：
1. 使用 Tool「search_city_coordinates」查詢使用者提到的城市經緯度。
2. 使用 Tool「get_weather」並帶入該經緯度取得即時天氣。
3. 讀取 Resource「outfit_guidelines」（URI: res://outfit_guidelines）取得穿搭指南。
4. 根據天氣與指南，給出簡潔的穿搭建議。若找不到城市或無法取得天氣，請友善說明並建議可改輸入的城市名稱。`,
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
    if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") {
      return new Response("Not Found", { status: 404 });
    }
    const server = createServer(env);
    return createMcpHandler(server as unknown as Server, { route: "/mcp" })(
      request,
      env,
      ctx
    );
  },
};
