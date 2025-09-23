import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { logDebug, withToolLogging } from "./logging";
import { karakeepClient, turndownService } from "./shared";
import {
  BookmarkSummary,
  compactBookmark,
  extractApiError,
  formatBookmarkSearchResult,
  ServiceError,
  toBookmarkSummary,
  toMcpToolError,
} from "./utils";

export const SearchBookmarksInputSchema = z
  .object({
    query: z.string(),
    limit: z.number().int().positive().max(100).optional().default(10),
    nextCursor: z.string().nullable().optional(),
    cursor: z.string().nullable().optional(),
  })
  .refine((value) => !(value.nextCursor && value.cursor), {
    message: "Provide either nextCursor or cursor, not both.",
    path: ["cursor"],
  });

export type SearchBookmarksInput = z.infer<typeof SearchBookmarksInputSchema>;

export interface SearchBookmarksResult {
  bookmarks: BookmarkSummary[];
  items: BookmarkSummary[];
  results: BookmarkSummary[];
  nextCursor: string | null;
  cursor: string | null;
  hasMore: boolean;
  data: {
    items: BookmarkSummary[];
    nextCursor: string | null;
    cursor: string | null;
    hasMore: boolean;
  };
  text: string;
}

export const GetBookmarkInputSchema = z.object({
  bookmarkId: z.string(),
});

export type GetBookmarkInput = z.infer<typeof GetBookmarkInputSchema>;

export const CreateBookmarkInputSchema = z.object({
  type: z.enum(["link", "text"]),
  title: z.string().optional(),
  content: z.string(),
});

export type CreateBookmarkInput = z.infer<typeof CreateBookmarkInputSchema>;

export const GetBookmarkContentInputSchema = z.object({
  bookmarkId: z.string(),
});

export type GetBookmarkContentInput = z.infer<
  typeof GetBookmarkContentInputSchema
>;

export interface BookmarkContentResult {
  format: "markdown";
  content: string;
}

export async function searchBookmarks(
  input: SearchBookmarksInput,
): Promise<SearchBookmarksResult> {
  const cursor = input.nextCursor ?? input.cursor ?? null;
  const normalizedQuery = input.query.trim().toLowerCase();
  const effectiveQuery = normalizedQuery === "bookmarks" ? "*" : input.query;

  if (effectiveQuery !== input.query) {
    logDebug(1, "Translated generic bookmarks query to wildcard", {
      originalQuery: input.query,
      effectiveQuery,
    });
  }

  const res = await karakeepClient.GET("/bookmarks/search", {
    params: {
      query: {
        q: effectiveQuery,
        limit: input.limit,
        includeContent: false,
        cursor: cursor ?? undefined,
      },
    },
  });

  if (!res.data) {
    const apiError = extractApiError(res);
    throw new ServiceError(apiError?.message ?? "Failed to search bookmarks", {
      code: apiError?.code,
      details: apiError?.raw ?? res,
      status: 400,
    });
  }

  const bookmarks = res.data.bookmarks.map(toBookmarkSummary);
  const nextCursor = res.data.nextCursor ?? null;
  const hasMore = nextCursor !== null;
  const paginatedData = {
    items: bookmarks,
    nextCursor,
    cursor,
    hasMore,
  } as const;

  return {
    bookmarks,
    items: bookmarks,
    results: bookmarks,
    nextCursor,
    cursor,
    hasMore,
    data: paginatedData,
    text: formatBookmarkSearchResult(bookmarks, nextCursor, effectiveQuery),
  };
}

export async function getBookmark(
  input: GetBookmarkInput,
): Promise<BookmarkSummary> {
  const res = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
    params: {
      path: { bookmarkId: input.bookmarkId },
      query: { includeContent: false },
    },
  });

  if (!res.data) {
    const apiError = extractApiError(res);
    throw new ServiceError(apiError?.message ?? "Failed to load bookmark", {
      code: apiError?.code,
      details: apiError?.raw ?? res,
      status: 404,
    });
  }

  return toBookmarkSummary(res.data);
}

export async function createBookmark(
  input: CreateBookmarkInput,
): Promise<BookmarkSummary> {
  const res = await karakeepClient.POST(`/bookmarks`, {
    body:
      input.type === "link"
        ? {
            type: "link",
            url: input.content,
            title: input.title,
          }
        : {
            type: "text",
            text: input.content,
            title: input.title,
          },
  });

  if (!res.data) {
    const apiError = extractApiError(res);
    throw new ServiceError(apiError?.message ?? "Failed to create bookmark", {
      code: apiError?.code,
      details: apiError?.raw ?? res,
      status: 400,
    });
  }

  return toBookmarkSummary(res.data);
}

export async function getBookmarkContent(
  input: GetBookmarkContentInput,
): Promise<BookmarkContentResult> {
  const res = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
    params: {
      path: { bookmarkId: input.bookmarkId },
      query: { includeContent: true },
    },
  });

  if (!res.data) {
    const apiError = extractApiError(res);
    throw new ServiceError(
      apiError?.message ?? "Failed to load bookmark content",
      {
        code: apiError?.code,
        details: apiError?.raw ?? res,
        status: 404,
      },
    );
  }

  let content = "";
  if (res.data.content.type === "link") {
    content = res.data.content.htmlContent
      ? turndownService.turndown(res.data.content.htmlContent)
      : "";
  } else if (res.data.content.type === "text") {
    content = res.data.content.text;
  } else if (res.data.content.type === "asset") {
    content = res.data.content.content ?? "";
  }

  return {
    format: "markdown",
    content,
  };
}

export function registerBookmarkTools(server: McpServer) {
  server.tool(
    "search-bookmarks",
    `Search for bookmarks matching a specific a query.
`,
    {
      query: z.string().describe(`
    By default, this will do a full-text search, but you can also use qualifiers to filter the results.
You can search bookmarks using specific qualifiers. is:fav finds favorited bookmarks,
is:archived searches archived bookmarks, is:tagged finds those with tags,
is:inlist finds those in lists, and is:link, is:text, and is:media filter by bookmark type.
url:<value> searches for URL substrings, #<tag> searches for bookmarks with a specific tag,
list:<name> searches for bookmarks in a specific list given its name (without the icon),
after:<date> finds bookmarks created on or after a date (YYYY-MM-DD), and before:<date> finds bookmarks created on or before a date (YYYY-MM-DD).
If you need to pass names with spaces, you can quote them with double quotes. If you want to negate a qualifier, prefix it with a minus sign.
## Examples:

### Find favorited bookmarks from 2023 that are tagged "important"
is:fav after:2023-01-01 before:2023-12-31 #important

### Find archived bookmarks that are either in "reading" list or tagged "work"
is:archived and (list:reading or #work)

### Combine text search with qualifiers
machine learning is:fav`),
      limit: z
        .number()
        .optional()
        .describe(`The number of results to return in a single query.`)
        .default(10),
      nextCursor: z
        .string()
        .nullish()
        .describe(
          `The next cursor to use for pagination. The value for this is returned from a previous call to this tool.`,
        ),
      cursor: z
        .string()
        .nullish()
        .describe(
          `An alias for nextCursor that can be supplied by clients expecting a generic cursor field.`,
        ),
    },
    withToolLogging(
      "search-bookmarks",
      async ({ query, limit, nextCursor, cursor }): Promise<CallToolResult> => {
        try {
          const result = await searchBookmarks({
            query,
            limit,
            nextCursor: nextCursor ?? undefined,
            cursor: cursor ?? undefined,
          });
          return {
            content: [
              {
                type: "text",
                text: result.text,
              },
              {
                type: "text",
                text: `JSON pagination data:\n\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``,
              },
            ],
            structuredContent: {
              result: result.data,
              bookmarks: result.bookmarks,
              items: result.items,
              results: result.results,
              nextCursor: result.nextCursor,
              cursor: result.cursor,
              hasMore: result.hasMore,
              data: result.data,
            },
          };
        } catch (error) {
          return toMcpToolError(error);
        }
      },
    ),
  );

  server.tool(
    "get-bookmark",
    `Get a bookmark by id.`,
    {
      bookmarkId: z.string().describe(`The bookmarkId to get.`),
    },
    withToolLogging(
      "get-bookmark",
      async ({ bookmarkId }): Promise<CallToolResult> => {
        try {
          const summary = await getBookmark({ bookmarkId });
          return {
            content: [
              {
                type: "text",
                text: compactBookmark(summary),
              },
            ],
            structuredContent: {
              bookmark: summary,
            },
          };
        } catch (error) {
          return toMcpToolError(error);
        }
      },
    ),
  );

  server.tool(
    "create-bookmark",
    `Create a link bookmark or a text bookmark`,
    {
      type: z
        .enum(["link", "text"])
        .describe(`The type of bookmark to create.`),
      title: z.string().optional().describe(`The title of the bookmark`),
      content: z
        .string()
        .describe(
          "If type is text, the text to be bookmarked. If the type is link, then it's the URL to be bookmarked.",
        ),
    },
    withToolLogging(
      "create-bookmark",
      async ({ title, type, content }): Promise<CallToolResult> => {
        try {
          const summary = await createBookmark({
            title,
            type,
            content,
          });
          return {
            content: [
              {
                type: "text",
                text: compactBookmark(summary),
              },
            ],
            structuredContent: {
              bookmark: summary,
            },
          };
        } catch (error) {
          return toMcpToolError(error);
        }
      },
    ),
  );

  server.tool(
    "get-bookmark-content",
    `Get the content of the bookmark in markdown`,
    {
      bookmarkId: z.string().describe(`The bookmarkId to get content for.`),
    },
    withToolLogging(
      "get-bookmark-content",
      async ({ bookmarkId }): Promise<CallToolResult> => {
        try {
          const result = await getBookmarkContent({ bookmarkId });
          return {
            content: [
              {
                type: "text",
                text: result.content,
              },
            ],
            structuredContent: {
              bookmarkId,
              content: result,
            },
          };
        } catch (error) {
          return toMcpToolError(error);
        }
      },
    ),
  );
}
