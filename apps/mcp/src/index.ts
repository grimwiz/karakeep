#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZodError } from "zod";

import {
  createBookmark,
  CreateBookmarkInputSchema,
  getBookmark,
  getBookmarkContent,
  GetBookmarkContentInputSchema,
  GetBookmarkInputSchema,
  searchBookmarks,
  SearchBookmarksInputSchema,
} from "./bookmarks";
import {
  addBookmarkToList,
  BookmarkListMutationSchema,
  createList,
  CreateListInputSchema,
  getLists,
  removeBookmarkFromList,
} from "./lists";
import { buildOpenApiConfig, buildOpenApiSpec } from "./openapi";
import { createMcpServer } from "./server";
import {
  attachTagsToBookmark,
  detachTagsFromBookmark,
  TagMutationInputSchema,
} from "./tags";
import { ServiceError } from "./utils";

type TransportMode = "stdio" | "openapi";

interface CliOptions {
  mode: TransportMode;
  port: number;
  host: string;
  path: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PATH = "/mcp";

function printHelp() {
  console.log(`Usage: karakeep-mcp [options]

Options:
  --stdio              Force stdio transport (default)
  --openapi            Start an HTTP server that exposes the MCP tools via OpenAPI
  --http               Alias for --openapi (deprecated)
  --transport <mode>   Explicitly choose "stdio" or "openapi"
  --port <number>      Port for HTTP mode (default: ${DEFAULT_PORT})
  --host <host>        Hostname for HTTP mode (default: ${DEFAULT_HOST})
  --path <path>        Base path for HTTP endpoints (default: ${DEFAULT_PATH})
  -h, --help           Show this message
`);
}

function parseTransport(value: string | undefined): TransportMode {
  if (!value) {
    return "stdio";
  }
  const normalized = value.toLowerCase();
  if (normalized === "stdio") {
    return "stdio";
  }
  if (normalized === "http" || normalized === "openapi") {
    return "openapi";
  }
  throw new Error(`Unknown transport mode: ${value}`);
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

function normalizePath(value: string | undefined): string {
  if (!value || value.trim() === "") {
    return DEFAULT_PATH;
  }
  let normalized = value.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function parseCliOptions(argv: string[]): CliOptions {
  let mode = parseTransport(process.env.KARAKEEP_MCP_TRANSPORT);
  let port = parsePort(
    process.env.KARAKEEP_MCP_PORT ?? process.env.PORT,
    DEFAULT_PORT,
  );
  let host = process.env.KARAKEEP_MCP_HOST ?? DEFAULT_HOST;
  let path = normalizePath(process.env.KARAKEEP_MCP_PATH ?? DEFAULT_PATH);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      case "--openapi":
      case "--http":
        mode = "openapi";
        break;
      case "--stdio":
        mode = "stdio";
        break;
      case "--transport": {
        const value = argv[i + 1];
        if (!value) {
          throw new Error("Missing value for --transport");
        }
        mode = parseTransport(value);
        i += 1;
        break;
      }
      case "--port":
      case "--http-port": {
        const value = argv[i + 1];
        if (!value) {
          throw new Error("Missing value for --port");
        }
        port = parsePort(value, port);
        i += 1;
        break;
      }
      case "--host":
      case "--http-host": {
        const value = argv[i + 1];
        if (!value) {
          throw new Error("Missing value for --host");
        }
        host = value;
        i += 1;
        break;
      }
      case "--path":
      case "--http-path": {
        const value = argv[i + 1];
        if (!value) {
          throw new Error("Missing value for --path");
        }
        path = normalizePath(value);
        i += 1;
        break;
      }
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  return { mode, port, host, path };
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  if (res.headersSent) {
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

function handleHttpError(res: ServerResponse, error: unknown) {
  if (error instanceof SyntaxError) {
    setCorsHeaders(res);
    sendJson(res, 400, {
      error: {
        message: "Invalid JSON payload",
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    setCorsHeaders(res);
    sendJson(res, 400, {
      error: {
        message: "Invalid request",
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof ServiceError) {
    setCorsHeaders(res);
    sendJson(res, error.status, {
      error: {
        message: error.message,
        code: error.code,
        status: error.status,
        details: error.details,
      },
    });
    return;
  }

  console.error("[Karakeep MCP] Unexpected HTTP error", error);
  setCorsHeaders(res);
  sendJson(res, 500, {
    error: {
      message: "Internal server error",
    },
  });
}

async function startOpenApiServer({ port, host, path }: CliOptions) {
  const basePath = path === "/" ? "" : path;
  const spec = buildOpenApiSpec(basePath);
  const config = buildOpenApiConfig(basePath);

  const httpServer = createServer(async (req, res) => {
    try {
      if (!req.url) {
        setCorsHeaders(res);
        sendJson(res, 400, {
          error: { message: "Bad Request" },
        });
        return;
      }

      const hostHeader = req.headers.host ?? `${host}:${port}`;
      const requestUrl = new URL(req.url, `http://${hostHeader}`);

      if (req.method === "OPTIONS") {
        setCorsHeaders(res);
        res.statusCode = 204;
        res.end();
        return;
      }

      if (
        basePath &&
        (!requestUrl.pathname.startsWith(basePath) ||
          (requestUrl.pathname.length > basePath.length &&
            requestUrl.pathname[basePath.length] !== "/"))
      ) {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }

      const relativePathRaw = basePath
        ? requestUrl.pathname.slice(basePath.length)
        : requestUrl.pathname;
      const relativePath = relativePathRaw === "" ? "/" : relativePathRaw;
      const segments = relativePath.split("/").filter(Boolean);

      if (req.method === "GET" && relativePath === "/openapi.json") {
        setCorsHeaders(res);
        sendJson(res, 200, spec);
        return;
      }

      if (req.method === "GET" && relativePath === "/openapi.conf") {
        setCorsHeaders(res);
        sendJson(res, 200, config);
        return;
      }

      if (req.method === "GET" && relativePath === "/") {
        setCorsHeaders(res);
        sendJson(res, 200, {
          status: "ok",
          message: "Karakeep MCP OpenAPI endpoint",
        });
        return;
      }

      if (req.method === "POST" && relativePath === "/bookmarks/search") {
        const body = await parseJsonBody(req);
        const input = SearchBookmarksInputSchema.parse(body ?? {});
        const result = await searchBookmarks(input);
        setCorsHeaders(res);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && relativePath === "/bookmarks") {
        const body = await parseJsonBody(req);
        const input = CreateBookmarkInputSchema.parse(body ?? {});
        const result = await createBookmark(input);
        setCorsHeaders(res);
        sendJson(res, 201, result);
        return;
      }

      if (
        req.method === "GET" &&
        segments[0] === "bookmarks" &&
        segments.length === 2
      ) {
        const bookmarkId = decodeURIComponent(segments[1]!);
        const input = GetBookmarkInputSchema.parse({ bookmarkId });
        const result = await getBookmark(input);
        setCorsHeaders(res);
        sendJson(res, 200, result);
        return;
      }

      if (
        req.method === "GET" &&
        segments[0] === "bookmarks" &&
        segments.length === 3 &&
        segments[2] === "content"
      ) {
        const bookmarkId = decodeURIComponent(segments[1]!);
        const input = GetBookmarkContentInputSchema.parse({ bookmarkId });
        const result = await getBookmarkContent(input);
        setCorsHeaders(res);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "GET" && relativePath === "/lists") {
        const result = await getLists();
        setCorsHeaders(res);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && relativePath === "/lists") {
        const body = await parseJsonBody(req);
        const input = CreateListInputSchema.parse(body ?? {});
        const result = await createList(input);
        setCorsHeaders(res);
        sendJson(res, 201, result);
        return;
      }

      if (
        segments[0] === "lists" &&
        segments.length === 4 &&
        segments[2] === "bookmarks" &&
        req.method === "POST"
      ) {
        const mutationInput = BookmarkListMutationSchema.parse({
          listId: decodeURIComponent(segments[1]!),
          bookmarkId: decodeURIComponent(segments[3]!),
        });
        const result = await addBookmarkToList(mutationInput);
        setCorsHeaders(res);
        sendJson(res, 200, result);
        return;
      }

      if (
        segments[0] === "lists" &&
        segments.length === 4 &&
        segments[2] === "bookmarks" &&
        req.method === "DELETE"
      ) {
        const mutationInput = BookmarkListMutationSchema.parse({
          listId: decodeURIComponent(segments[1]!),
          bookmarkId: decodeURIComponent(segments[3]!),
        });
        const result = await removeBookmarkFromList(mutationInput);
        setCorsHeaders(res);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && relativePath === "/tags/attach") {
        const body = await parseJsonBody(req);
        const input = TagMutationInputSchema.parse(body ?? {});
        const result = await attachTagsToBookmark(input);
        setCorsHeaders(res);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && relativePath === "/tags/detach") {
        const body = await parseJsonBody(req);
        const input = TagMutationInputSchema.parse(body ?? {});
        const result = await detachTagsFromBookmark(input);
        setCorsHeaders(res);
        sendJson(res, 200, result);
        return;
      }

      res.statusCode = 404;
      setCorsHeaders(res);
      res.end("Not Found");
    } catch (error) {
      handleHttpError(res, error);
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      console.log(
        `Karakeep MCP OpenAPI server listening on http://${host}:${port}${path === "/" ? "" : path}`,
      );
      resolve();
    });
  });
}

async function startStdioServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function run() {
  const options = parseCliOptions(process.argv.slice(2));

  if (options.mode === "openapi") {
    await startOpenApiServer(options);
    return;
  }

  await startStdioServer();
}

run().catch((error) => {
  console.error("[Karakeep MCP] Failed to start server", error);
  process.exit(1);
});
