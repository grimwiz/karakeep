import { CallToolResult } from "@modelcontextprotocol/sdk/types";

import { KarakeepAPISchemas } from "@karakeep/sdk";

export class ServiceError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "ServiceError";
    this.status = options?.status ?? 500;
    this.code = options?.code;
    this.details = options?.details;
  }
}

interface NormalizedError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

export interface ApiErrorDetails {
  code?: string;
  message?: string;
  raw?: unknown;
}

function normalizeError(error: unknown): NormalizedError {
  if (!error) {
    return { message: "Something went wrong" };
  }

  if (error instanceof ServiceError) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }

  if (typeof error === "object") {
    const message =
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Something went wrong";
    const code =
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;

    return {
      message,
      code,
      details: error,
    };
  }

  return {
    message: String(error),
  };
}

export function toMcpToolError(error: unknown): CallToolResult {
  const normalized = normalizeError(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(normalized),
      },
    ],
    structuredContent: {
      error: normalized,
    },
  };
}

export function extractApiError(res: unknown): ApiErrorDetails | undefined {
  if (!res || typeof res !== "object") {
    return undefined;
  }
  if (!("error" in res)) {
    return undefined;
  }
  const raw = (res as { error?: unknown }).error;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const messageValue = (raw as { message?: unknown }).message;
  const codeValue = (raw as { code?: unknown }).code;
  return {
    message: typeof messageValue === "string" ? messageValue : undefined,
    code: typeof codeValue === "string" ? codeValue : undefined,
    raw,
  };
}

export interface BookmarkSummary {
  id: string;
  createdAt: string;
  modifiedAt: string | null;
  title: string | null | undefined;
  summary: string | null | undefined;
  note: string | null | undefined;
  archived: boolean;
  favourited: boolean;
  taggingStatus: string | null | undefined;
  summarizationStatus: string | null | undefined;
  type: "link" | "text" | "asset" | "unknown";
  url?: string | null;
  description?: string | null;
  author?: string | null;
  publisher?: string | null;
  sourceUrl?: string | null;
  assetId?: string | null;
  assetType?: string | null;
  tags: string[];
}

export function toBookmarkSummary(
  bookmark: KarakeepAPISchemas["Bookmark"],
): BookmarkSummary {
  const summary: BookmarkSummary = {
    id: bookmark.id,
    createdAt: bookmark.createdAt,
    modifiedAt: bookmark.modifiedAt,
    title:
      bookmark.title ??
      (bookmark.content.type === "link"
        ? (bookmark.content.title ?? null)
        : null),
    summary: bookmark.summary,
    note: bookmark.note,
    archived: bookmark.archived,
    favourited: bookmark.favourited,
    taggingStatus: bookmark.taggingStatus,
    summarizationStatus: bookmark.summarizationStatus,
    type: bookmark.content.type ?? "unknown",
    tags: bookmark.tags.map((tag) => tag.name),
  };

  switch (bookmark.content.type) {
    case "link":
      summary.url = bookmark.content.url;
      summary.description = bookmark.content.description ?? null;
      summary.author = bookmark.content.author ?? null;
      summary.publisher = bookmark.content.publisher ?? null;
      break;
    case "text":
      summary.sourceUrl = bookmark.content.sourceUrl ?? null;
      break;
    case "asset":
      summary.assetId = bookmark.content.assetId;
      summary.assetType = bookmark.content.assetType;
      summary.sourceUrl = bookmark.content.sourceUrl ?? null;
      break;
    default:
      break;
  }

  return summary;
}

export function compactBookmark(summary: BookmarkSummary): string {
  const details = (() => {
    switch (summary.type) {
      case "link":
        return `Bookmark type: link\nBookmarked URL: ${summary.url ?? ""}\ndescription: ${summary.description ?? ""}\nauthor: ${summary.author ?? ""}\npublisher: ${summary.publisher ?? ""}`;
      case "text":
        return `Bookmark type: text\nSource URL: ${summary.sourceUrl ?? ""}`;
      case "asset":
        return `Bookmark type: media\nAsset ID: ${summary.assetId ?? ""}\nAsset type: ${summary.assetType ?? ""}\nSource URL: ${summary.sourceUrl ?? ""}`;
      default:
        return `Bookmark type: unknown`;
    }
  })();

  return `Bookmark ID: ${summary.id}\n  Created at: ${summary.createdAt}\n  Title: ${summary.title ?? ""}\n  Summary: ${summary.summary ?? ""}\n  Note: ${summary.note ?? ""}\n  ${details}\n  Tags: ${summary.tags.join(", ")}`;
}

const MARKDOWN_ESCAPE_CHARACTERS = new Set<string>([
  "\\",
  "`",
  "*",
  "_",
  "{",
  "}",
  "[",
  "]",
  "(",
  ")",
  "#",
  "+",
  ".",
  "!",
  "|",
  ">",
  "~",
  "-",
]);

function escapeMarkdownText(value: string): string {
  let escaped = "";
  for (const char of value) {
    escaped += MARKDOWN_ESCAPE_CHARACTERS.has(char) ? `\\${char}` : char;
  }
  return escaped;
}

function escapeOptionalMarkdownText<T extends string | null | undefined>(
  value: T,
): T {
  if (value === null || value === undefined) {
    return value;
  }

  return escapeMarkdownText(value) as T;
}

export function escapeBookmarkSummaryMarkdown(
  summary: BookmarkSummary,
): BookmarkSummary {
  return {
    ...summary,
    title: escapeOptionalMarkdownText(summary.title),
    summary: escapeOptionalMarkdownText(summary.summary),
    note: escapeOptionalMarkdownText(summary.note),
    taggingStatus: escapeOptionalMarkdownText(summary.taggingStatus),
    summarizationStatus: escapeOptionalMarkdownText(
      summary.summarizationStatus,
    ),
    url: escapeOptionalMarkdownText(summary.url),
    description: escapeOptionalMarkdownText(summary.description),
    author: escapeOptionalMarkdownText(summary.author),
    publisher: escapeOptionalMarkdownText(summary.publisher),
    sourceUrl: escapeOptionalMarkdownText(summary.sourceUrl),
    assetId: escapeOptionalMarkdownText(summary.assetId),
    assetType: escapeOptionalMarkdownText(summary.assetType),
    tags: summary.tags.map((tag) => escapeMarkdownText(tag)),
  } satisfies BookmarkSummary;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  return `${truncated}…`;
}

function formatBookmarkLine(bookmark: BookmarkSummary, index: number): string {
  const parts: string[] = [];
  const createdAtDate = new Date(bookmark.createdAt);
  const createdAt = Number.isNaN(createdAtDate.getTime())
    ? null
    : createdAtDate.toISOString().split("T")[0];

  const title = bookmark.title?.trim() || "Untitled bookmark";
  const headerLine = `${index + 1}. ${title}${createdAt ? ` (${createdAt})` : ""}`;
  parts.push(headerLine);

  const summary = bookmark.summary?.trim();
  if (summary) {
    parts.push(`   Summary: ${truncateText(summary, 400)}`);
  }

  const note = bookmark.note?.trim();
  if (note) {
    parts.push(`   Note: ${truncateText(note, 200)}`);
  }

  const url = bookmark.url ?? bookmark.sourceUrl;
  if (url) {
    parts.push(`   Link: ${url}`);
  }

  if (bookmark.tags.length > 0) {
    parts.push(`   Tags: ${bookmark.tags.join(", ")}`);
  }

  return parts.join("\n");
}

export function formatBookmarkSearchResult(
  bookmarks: BookmarkSummary[],
  nextCursor: string | null,
  query?: string,
): string {
  if (bookmarks.length === 0) {
    const header =
      "Karakeep search-bookmarks tool response (not a user message):";
    const message = query
      ? `- No bookmarks matched the query "${query}".`
      : "- No bookmarks matched the current query.";
    const cursorLine = `- Next cursor: ${
      nextCursor ? `'${nextCursor}'` : "no more pages"
    }.`;
    return [header, message, cursorLine].join("\n");
  }

  const summaryLines = [
    "Karakeep search-bookmarks tool response (not a user message):",
    `- Found ${bookmarks.length} bookmark${bookmarks.length === 1 ? "" : "s"}.`,
  ];
  if (query && query.trim().length > 0) {
    summaryLines.push(`- Query: "${query}".`);
  }
  summaryLines.push(
    `- Next cursor: ${nextCursor ? `'${nextCursor}'` : "no more pages"}.`,
  );

  const formattedBookmarks = bookmarks
    .map((bookmark, index) => formatBookmarkLine(bookmark, index))
    .join("\n\n");

  return `${summaryLines.join("\n")}\n\n${formattedBookmarks}`;
}

export interface ListSummary {
  id: string;
  name: string;
  description: string | null | undefined;
  icon: string;
  parentId: string | null;
  type: string;
  query: string | null | undefined;
  public: boolean;
}

export function toListSummary(list: KarakeepAPISchemas["List"]): ListSummary {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    icon: list.icon,
    parentId: list.parentId,
    type: list.type,
    query: list.query,
    public: list.public,
  };
}
