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
