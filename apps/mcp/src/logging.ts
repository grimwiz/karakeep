const DEBUG_ENV_VAR = "KARAKEEP_MCP_DEBUG";
const MAX_DEBUG_LEVEL = 2;
const DEBUG_PREFIX = "[Karakeep MCP]";
const MAX_STRING_LENGTH_LEVEL1 = 256;
const MAX_COLLECTION_LENGTH_LEVEL1 = 5;
const MAX_PREVIEW_DEPTH_LEVEL1 = 2;

let cachedDebugLevel: number | undefined;

export interface OpenApiRequestContext {
  method: string;
  path: string;
}

interface ToolLogMetadata {
  tool: string;
  requestId?: string;
}

interface ToolExtraLike {
  request?: { id?: unknown };
}

function getCachedDebugLevel(): number | undefined {
  return cachedDebugLevel;
}

export function getDebugLevel(): number {
  const cached = getCachedDebugLevel();
  if (typeof cached === "number") {
    return cached;
  }

  const raw = process.env[DEBUG_ENV_VAR];
  if (!raw) {
    cachedDebugLevel = 0;
    return cachedDebugLevel;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    cachedDebugLevel = 0;
    return cachedDebugLevel;
  }

  cachedDebugLevel = Math.min(parsed, MAX_DEBUG_LEVEL);
  return cachedDebugLevel;
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH_LEVEL1) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH_LEVEL1)}… [truncated ${value.length - MAX_STRING_LENGTH_LEVEL1} chars]`;
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ? truncateString(error.stack) : undefined,
    };
  }

  return { value: error };
}

function truncateCollection<T>(
  values: readonly T[],
  formatter: (item: T) => unknown,
): unknown[] {
  const slice = values.slice(0, MAX_COLLECTION_LENGTH_LEVEL1);
  const formatted = slice.map(formatter);
  if (values.length > MAX_COLLECTION_LENGTH_LEVEL1) {
    formatted.push(
      `… ${values.length - MAX_COLLECTION_LENGTH_LEVEL1} more item(s) truncated (total ${values.length})`,
    );
  }
  return formatted;
}

function truncateObject(
  value: Record<string, unknown>,
  formatter: (item: unknown) => unknown,
): Record<string, unknown> {
  const entries = Object.entries(value);
  const truncatedEntries = entries.slice(0, MAX_COLLECTION_LENGTH_LEVEL1);
  const result: Record<string, unknown> = {};

  for (const [key, entryValue] of truncatedEntries) {
    result[key] = formatter(entryValue);
  }

  if (entries.length > MAX_COLLECTION_LENGTH_LEVEL1) {
    result["__truncated__"] =
      `${entries.length - MAX_COLLECTION_LENGTH_LEVEL1} more key(s) truncated`;
  }

  return result;
}

function truncateValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    const bufferPreview = value.toString("utf8");
    return {
      type: "Buffer",
      length: value.length,
      preview: truncateString(bufferPreview),
    };
  }

  if (ArrayBuffer.isView(value)) {
    return {
      type: value.constructor.name,
      byteLength: value.byteLength,
    };
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  if (Array.isArray(value)) {
    if (depth <= 0) {
      return `[Array(${value.length})]`;
    }
    seen.add(value);
    return truncateCollection(value, (item) =>
      truncateValue(item, seen, depth - 1),
    );
  }

  if (value instanceof Map) {
    if (depth <= 0) {
      return `[Map(${value.size})]`;
    }
    seen.add(value);
    return truncateCollection(
      Array.from(value.entries()),
      ([key, entryValue]) => ({
        key: truncateValue(key, seen, depth - 1),
        value: truncateValue(entryValue, seen, depth - 1),
      }),
    );
  }

  if (value instanceof Set) {
    if (depth <= 0) {
      return `[Set(${value.size})]`;
    }
    seen.add(value);
    return truncateCollection(Array.from(value.values()), (item) =>
      truncateValue(item, seen, depth - 1),
    );
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  if (depth <= 0) {
    const keys = Object.keys(value as Record<string, unknown>);
    return `[Object(${keys.length} keys)]`;
  }
  seen.add(value);
  return truncateObject(value as Record<string, unknown>, (item) =>
    truncateValue(item, seen, depth - 1),
  );
}

function prepareDetails(details: unknown, debugLevel: number): unknown {
  if (debugLevel >= 2 || details === undefined) {
    return details;
  }

  return truncateValue(details, new WeakSet(), MAX_PREVIEW_DEPTH_LEVEL1);
}

export function logDebug(level: number, message: string, details?: unknown) {
  const debugLevel = getDebugLevel();
  if (debugLevel < level) {
    return;
  }

  const prefix = `${DEBUG_PREFIX} [debug${level}]`;
  if (typeof details === "undefined") {
    console.log(`${prefix} ${message}`);
    return;
  }

  const formattedDetails = prepareDetails(details, debugLevel);
  if (
    typeof formattedDetails === "string" ||
    typeof formattedDetails === "number" ||
    typeof formattedDetails === "boolean"
  ) {
    console.log(`${prefix} ${message}:`, formattedDetails);
    return;
  }

  console.log(`${prefix} ${message}`, formattedDetails);
}

export function logInfo(message: string, details?: unknown) {
  logDebug(0, message, details);
}

export function logOpenApiRequest(context: OpenApiRequestContext) {
  logDebug(1, `OpenAPI request ${context.method} ${context.path}`);
}

export function logOpenApiRequestData(
  context: OpenApiRequestContext,
  data: unknown,
  description = "payload",
) {
  if (getDebugLevel() < 1) {
    return;
  }

  logDebug(1, `OpenAPI request ${description}`, {
    method: context.method,
    path: context.path,
    data,
  });
}

export function logOpenApiResponse(
  context: OpenApiRequestContext,
  statusCode: number,
  payload: unknown,
) {
  logDebug(
    1,
    `OpenAPI response ${context.method} ${context.path} -> ${statusCode}`,
  );
  if (getDebugLevel() < 1) {
    return;
  }

  logDebug(1, "OpenAPI response payload", {
    method: context.method,
    path: context.path,
    status: statusCode,
    body: payload,
  });
}

function extractRequestId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== "object") {
    return undefined;
  }

  const requestId = (extra as ToolExtraLike).request?.id;
  if (typeof requestId === "string" || typeof requestId === "number") {
    return `${requestId}`;
  }

  if (typeof requestId === "object" && requestId !== null) {
    try {
      return JSON.stringify(requestId);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function buildToolMetadata(toolName: string, extra: unknown): ToolLogMetadata {
  const metadata: ToolLogMetadata = { tool: toolName };
  const requestId = extractRequestId(extra);
  if (requestId) {
    metadata.requestId = requestId;
  }
  return metadata;
}

function normalizeToolInvocation(handlerArgs: unknown[]): {
  args: unknown;
  extra: unknown;
} {
  if (handlerArgs.length >= 2) {
    return { args: handlerArgs[0], extra: handlerArgs[1] };
  }
  if (handlerArgs.length === 1) {
    return { args: undefined, extra: handlerArgs[0] };
  }
  return { args: undefined, extra: undefined };
}

export function withToolLogging<Args extends unknown[], Result>(
  toolName: string,
  handler: (...args: Args) => Result | Promise<Result>,
): (...args: Args) => Promise<Awaited<Result>> {
  return async (...handlerArgs: Args): Promise<Awaited<Result>> => {
    const { args, extra } = normalizeToolInvocation(handlerArgs as unknown[]);
    const metadata = buildToolMetadata(toolName, extra);

    logDebug(1, "Tool request received", {
      ...metadata,
      arguments: args ?? null,
    });

    try {
      const result = await handler(...handlerArgs);
      logDebug(1, "Tool response prepared", {
        ...metadata,
        result,
      });
      return result as Awaited<Result>;
    } catch (error) {
      logDebug(1, "Tool request failed", {
        ...metadata,
        error: formatError(error),
        arguments: args ?? null,
      });
      throw error;
    }
  };
}
