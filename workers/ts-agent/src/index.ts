/// <reference path="../worker-configuration.d.ts" />
import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";

function createServer(): McpServer {
  const server = new McpServer({
    name: "Weather & Outfit MCP",
    version: "1.0.0",
  });

  server.tool(
    "hello",
    "Placeholder tool for MCP server health check",
    {},
    async () => ({
      content: [{ type: "text", text: "Hello from Weather & Outfit MCP." }],
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
    const server = createServer();
    return createMcpHandler(server as unknown as Server, { route: "/mcp" })(request, env, ctx);
  },
};
