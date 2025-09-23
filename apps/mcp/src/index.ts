#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZodError } from "zod";

import type { OpenApiRequestContext } from "./logging";
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
import {
  getDebugLevel,
  logDebug,
  logInfo,
  logOpenApiRequest,
  logOpenApiRequestData,
  logOpenApiResponse,
} from "./logging";
import { buildOpenApiConfig, buildOpenApiSpec } from "./openapi";
import { createMcpServer } from "./server";
import {
  attachTagsToBookmark,
  detachTagsFromBookmark,
  TagMutationInputSchema,
} from "./tags";
import { ServiceError } from "./utils";

type TransportMode = "stdio" | "openapi";

type PathSource = "default" | "env" | "cli";

interface CliOptions {
  mode: TransportMode;
  port: number;
  host: string;
  path: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PATH = "/";

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
  let path = DEFAULT_PATH;
  let pathSource: PathSource = "default";

  const envPath = process.env.KARAKEEP_MCP_PATH;
  if (typeof envPath === "string") {
    path = normalizePath(envPath);
    pathSource = "env";
  }

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
        pathSource = "cli";
        i += 1;
        break;
      }
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  if (pathSource === "default" && path !== DEFAULT_PATH) {
    logDebug(1, "Resetting legacy default base path", {
      previousPath: path,
      defaultPath: DEFAULT_PATH,
    });
    path = DEFAULT_PATH;
  }

  return { mode, port, host, path };
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
  context?: OpenApiRequestContext,
) {
  if (res.headersSent) {
    return;
  }
  if (context) {
    logOpenApiResponse(context, statusCode, body);
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

function handleHttpError(
  res: ServerResponse,
  error: unknown,
  context?: OpenApiRequestContext,
) {
  if (error instanceof SyntaxError) {
    setCorsHeaders(res);
    sendJson(
      res,
      400,
      {
        error: {
          message: "Invalid JSON payload",
        },
      },
      context,
    );
    return;
  }

  if (error instanceof ZodError) {
    setCorsHeaders(res);
    sendJson(
      res,
      400,
      {
        error: {
          message: "Invalid request",
          details: error.flatten(),
        },
      },
      context,
    );
    return;
  }

  if (error instanceof ServiceError) {
    setCorsHeaders(res);
    sendJson(
      res,
      error.status,
      {
        error: {
          message: error.message,
          code: error.code,
          status: error.status,
          details: error.details,
        },
      },
      context,
    );
    return;
  }

  console.error("[Karakeep MCP] Unexpected HTTP error", error);
  setCorsHeaders(res);
  sendJson(
    res,
    500,
    {
      error: {
        message: "Internal server error",
      },
    },
    context,
  );
}

async function startOpenApiServer({ port, host, path }: CliOptions) {
  const basePath = path === "/" ? "" : path;
  const spec = buildOpenApiSpec(basePath);
  const config = buildOpenApiConfig(basePath);

  const httpServer = createServer(async (req, res) => {
    const method = req.method ?? "UNKNOWN";
    let context: OpenApiRequestContext = {
      method,
      path: req.url ?? "[unknown]",
    };

    try {
      if (!req.url) {
        logOpenApiRequest(context);
        setCorsHeaders(res);
        sendJson(
          res,
          400,
          {
            error: { message: "Bad Request" },
          },
          context,
        );
        return;
      }

      const hostHeader = req.headers.host ?? `${host}:${port}`;
      const requestUrl = new URL(req.url, `http://${hostHeader}`);
      context = { method, path: requestUrl.pathname };

      if (
        basePath &&
        (!requestUrl.pathname.startsWith(basePath) ||
          (requestUrl.pathname.length > basePath.length &&
            requestUrl.pathname[basePath.length] !== "/"))
      ) {
        res.statusCode = 404;
        setCorsHeaders(res);
        logOpenApiRequest(context);
        logOpenApiResponse(context, 404, "Not Found");
        res.end("Not Found");
        return;
      }

      const relativePathRaw = basePath
        ? requestUrl.pathname.slice(basePath.length)
        : requestUrl.pathname;
      const relativePath = relativePathRaw === "" ? "/" : relativePathRaw;
      const segments = relativePath.split("/").filter(Boolean);

      context = { method, path: relativePath };

      logOpenApiRequest(context);

      if (req.method === "OPTIONS") {
        setCorsHeaders(res);
        res.statusCode = 204;
        logOpenApiResponse(context, 204, null);
        res.end();
        return;
      }

      if (
        relativePath === "/openapi.json" &&
        (req.method === "GET" || req.method === "POST" || req.method === "HEAD")
      ) {
        setCorsHeaders(res);
        if (req.method === "HEAD") {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          logOpenApiResponse(context, 200, null);
          res.end();
          return;
        }

        sendJson(res, 200, spec, context);
        return;
      }

      if (req.method === "GET" && relativePath === "/openapi.conf") {
        setCorsHeaders(res);
        sendJson(res, 200, config, context);
        return;
      }

      if (req.method === "GET" && relativePath === "/") {
        setCorsHeaders(res);
        sendJson(
          res,
          200,
          {
            status: "ok",
            message: "Karakeep MCP OpenAPI endpoint",
          },
          context,
        );
        return;
      }

      if (req.method === "POST" && relativePath === "/bookmarks/search") {
        const body = await parseJsonBody(req);
        const input = SearchBookmarksInputSchema.parse(body ?? {});
        logInfo("OpenAPI search-bookmarks request", {
          query: input.query,
          limit: input.limit,
          nextCursor: input.nextCursor ?? null,
        });
        logOpenApiRequestData(context, { rawBody: body, input });
        const result = await searchBookmarks(input);
        logDebug(1, "OpenAPI search-bookmarks response", {
          count: result.items.length,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        });
        logDebug(1, "OpenAPI search-bookmarks response text", result.text);
        logDebug(1, "OpenAPI search-bookmarks response data", result.data);
        setCorsHeaders(res);
        sendJson(res, 200, result, context);
        return;
      }

      if (req.method === "POST" && relativePath === "/bookmarks") {
        const body = await parseJsonBody(req);
        const input = CreateBookmarkInputSchema.parse(body ?? {});
        logOpenApiRequestData(context, { rawBody: body, input });
        const result = await createBookmark(input);
        setCorsHeaders(res);
        sendJson(res, 201, result, context);
        return;
      }

      if (
        req.method === "GET" &&
        segments[0] === "bookmarks" &&
        segments.length === 2
      ) {
        const bookmarkId = decodeURIComponent(segments[1]!);
        const input = GetBookmarkInputSchema.parse({ bookmarkId });
        logOpenApiRequestData(context, { params: input });
        const result = await getBookmark(input);
        setCorsHeaders(res);
        sendJson(res, 200, result, context);
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
        logOpenApiRequestData(context, { params: input });
        const result = await getBookmarkContent(input);
        setCorsHeaders(res);
        sendJson(res, 200, result, context);
        return;
      }

      if (req.method === "GET" && relativePath === "/lists") {
        const result = await getLists();
        setCorsHeaders(res);
        sendJson(res, 200, result, context);
        return;
      }

      if (req.method === "POST" && relativePath === "/lists") {
        const body = await parseJsonBody(req);
        const input = CreateListInputSchema.parse(body ?? {});
        logOpenApiRequestData(context, { rawBody: body, input });
        const result = await createList(input);
        setCorsHeaders(res);
        sendJson(res, 201, result, context);
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
        logOpenApiRequestData(context, { params: mutationInput });
        const result = await addBookmarkToList(mutationInput);
        setCorsHeaders(res);
        sendJson(res, 200, result, context);
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
        logOpenApiRequestData(context, { params: mutationInput });
        const result = await removeBookmarkFromList(mutationInput);
        setCorsHeaders(res);
        sendJson(res, 200, result, context);
        return;
      }

      if (req.method === "POST" && relativePath === "/tags/attach") {
        const body = await parseJsonBody(req);
        const input = TagMutationInputSchema.parse(body ?? {});
        logOpenApiRequestData(context, { rawBody: body, input });
        const result = await attachTagsToBookmark(input);
        setCorsHeaders(res);
        sendJson(res, 200, result, context);
        return;
      }

      if (req.method === "POST" && relativePath === "/tags/detach") {
        const body = await parseJsonBody(req);
        const input = TagMutationInputSchema.parse(body ?? {});
        logOpenApiRequestData(context, { rawBody: body, input });
        const result = await detachTagsFromBookmark(input);
        setCorsHeaders(res);
        sendJson(res, 200, result, context);
        return;
      }

      res.statusCode = 404;
      setCorsHeaders(res);
      logOpenApiResponse(context, 404, "Not Found");
      res.end("Not Found");
    } catch (error) {
      handleHttpError(res, error, context);
    }
  });

  await new Promise<void>((resolve, reject) => {
    let isShuttingDown = false;

    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

    function cleanup() {
      for (const signal of signals) {
        process.removeListener(signal, handleSignal);
      }
      httpServer.removeListener("error", onError);
      httpServer.removeListener("close", onClose);
    }

    function finalize() {
      cleanup();
      resolve();
    }

    function onClose() {
      logInfo("OpenAPI server stopped");
      finalize();
    }

    function handleSignal(signal: NodeJS.Signals) {
      if (isShuttingDown) {
        console.error(
          `[Karakeep MCP] Received ${signal} during shutdown, forcing exit`,
        );
        process.exit(1);
        return;
      }

      isShuttingDown = true;
      logInfo(`Received ${signal}, shutting down OpenAPI server`);
      httpServer.close((closeError) => {
        const error = closeError as NodeJS.ErrnoException | undefined;
        if (error && error.code !== "ERR_SERVER_NOT_RUNNING") {
          cleanup();
          reject(error);
          return;
        }

        if (error && error.code === "ERR_SERVER_NOT_RUNNING") {
          onClose();
        }
        // If there was no error we wait for the "close" event to resolve.
      });
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    httpServer.on("error", onError);
    httpServer.on("close", onClose);

    for (const signal of signals) {
      process.on(signal, handleSignal);
    }

    httpServer.listen(port, host, () => {
      console.log(
        `Karakeep MCP OpenAPI server listening on http://${host}:${port}${path === "/" ? "" : path}`,
      );
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
  const debugLevel = getDebugLevel();
  if (debugLevel > 0) {
    logDebug(1, "Debug logging enabled", { level: debugLevel });
  }

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
