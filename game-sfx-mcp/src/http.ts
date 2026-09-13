#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./server.js";

const PORT = Number(process.env.PORT) || 8787;
const API_KEY = process.env.API_KEY;

const transports = new Map<string, StreamableHTTPServerTransport>();

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!API_KEY) return true;
  return req.headers["authorization"] === `Bearer ${API_KEY}`;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8");
  return text ? JSON.parse(text) : undefined;
}

const httpServer = createHttpServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.url !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }));
    return;
  }

  if (!isAuthorized(req)) {
    res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      const parsedBody = await readJsonBody(req);
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (sessionId) {
          res
            .writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unknown session" }, id: null }));
          return;
        }
        if (!isInitializeRequest(parsedBody)) {
          res
            .writeHead(400, { "Content-Type": "application/json" })
            .end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Bad Request: No valid session ID provided" },
                id: null,
              })
            );
          return;
        }

        const newTransport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, newTransport);
          },
        });
        newTransport.onclose = () => {
          if (newTransport.sessionId) transports.delete(newTransport.sessionId);
        };
        const server = createMcpServer();
        await server.connect(newTransport);
        transport = newTransport;
      }

      await transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (req.method === "GET" || req.method === "DELETE") {
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Invalid or missing session ID" }));
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(405, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "method not allowed" }));
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`game-sfx-mcp HTTP (Streamable HTTP) API listening on http://localhost:${PORT}/mcp`);
  if (!API_KEY) {
    console.warn("Warning: API_KEY is not set. This endpoint is unauthenticated -- do not expose it publicly without one.");
  }
});
