import { SEARCH_QUERY_LANGUAGE_DESCRIPTION } from "./search-query-docs";

const SEARCH_QUERY_LANGUAGE_HELP_TEXT =
  SEARCH_QUERY_LANGUAGE_DESCRIPTION.trim();
const searchBookmarksOperationDescription = `${SEARCH_QUERY_LANGUAGE_HELP_TEXT}\n\nUse the optional limit and cursor fields to paginate through large result sets.`;

const bookmarkSummarySchema = {
  type: "object",
  required: [
    "id",
    "createdAt",
    "modifiedAt",
    "archived",
    "favourited",
    "type",
    "tags",
  ],
  properties: {
    id: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    modifiedAt: { type: ["string", "null"], format: "date-time" },
    title: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    note: { type: ["string", "null"] },
    archived: { type: "boolean" },
    favourited: { type: "boolean" },
    taggingStatus: { type: ["string", "null"] },
    summarizationStatus: { type: ["string", "null"] },
    type: { type: "string", enum: ["link", "text", "asset", "unknown"] },
    url: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    author: { type: ["string", "null"] },
    publisher: { type: ["string", "null"] },
    sourceUrl: { type: ["string", "null"] },
    assetId: { type: ["string", "null"] },
    assetType: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
} as const;

const bookmarkContentSchema = {
  type: "object",
  required: ["format", "content"],
  properties: {
    format: { type: "string", enum: ["markdown"] },
    content: { type: "string" },
  },
  additionalProperties: false,
} as const;

const searchBookmarksInputSchema = {
  type: "object",
  description:
    "Parameters for searching bookmarks with Karakeep's query language.",
  required: ["query"],
  properties: {
    query: {
      type: "string",
      description: SEARCH_QUERY_LANGUAGE_HELP_TEXT,
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      description:
        "Maximum number of bookmarks to return per page (default 10).",
    },
    nextCursor: {
      type: ["string", "null"],
      description:
        "Cursor returned from a previous response to continue pagination.",
    },
    cursor: {
      type: ["string", "null"],
      description:
        "Alias for nextCursor for clients expecting a generic cursor field.",
    },
  },
  additionalProperties: false,
} as const;

const searchBookmarksResultSchema = {
  type: "object",
  description:
    "Search response containing bookmark summaries, pagination cursors, and a human-readable summary of the results.",
  required: [
    "bookmarks",
    "items",
    "results",
    "nextCursor",
    "cursor",
    "hasMore",
    "data",
    "raw",
    "text",
  ],
  properties: {
    bookmarks: {
      type: "array",
      description:
        "Bookmark summaries with Markdown-significant characters escaped for display.",
      items: bookmarkSummarySchema,
    },
    items: {
      type: "array",
      description: "Alias for bookmarks maintained for compatibility.",
      items: bookmarkSummarySchema,
    },
    results: {
      type: "array",
      description: "Alias for bookmarks maintained for compatibility.",
      items: bookmarkSummarySchema,
    },
    nextCursor: {
      type: ["string", "null"],
      description: "Cursor to request the next page of results, if available.",
    },
    cursor: {
      type: ["string", "null"],
      description: "Echo of the cursor that was used for this page.",
    },
    hasMore: {
      type: "boolean",
      description:
        "Indicates whether additional pages of results are available.",
    },
    data: {
      type: "object",
      description:
        "Structured pagination payload containing the next cursor and the bookmarks for the current page.",
      required: ["items", "nextCursor", "cursor", "hasMore"],
      properties: {
        items: {
          type: "array",
          description: "Bookmarks for the current page.",
          items: bookmarkSummarySchema,
        },
        nextCursor: {
          type: ["string", "null"],
          description: "Cursor to continue pagination.",
        },
        cursor: {
          type: ["string", "null"],
          description: "Cursor that was used to retrieve this page.",
        },
        hasMore: {
          type: "boolean",
          description: "Whether more results are available after this page.",
        },
      },
      additionalProperties: false,
    },
    raw: {
      type: "object",
      description:
        "Original bookmark data prior to Markdown escaping for consumers that require the unmodified values.",
      required: ["bookmarks", "items", "results", "data"],
      properties: {
        bookmarks: {
          type: "array",
          description: "Raw bookmark summaries.",
          items: bookmarkSummarySchema,
        },
        items: {
          type: "array",
          description:
            "Alias for raw bookmark summaries maintained for compatibility.",
          items: bookmarkSummarySchema,
        },
        results: {
          type: "array",
          description:
            "Alias for raw bookmark summaries maintained for compatibility.",
          items: bookmarkSummarySchema,
        },
        data: {
          type: "object",
          description:
            "Structured pagination payload containing the raw bookmark summaries for the current page.",
          required: ["items", "nextCursor", "cursor", "hasMore"],
          properties: {
            items: {
              type: "array",
              description: "Raw bookmarks for the current page.",
              items: bookmarkSummarySchema,
            },
            nextCursor: {
              type: ["string", "null"],
              description: "Cursor to continue pagination.",
            },
            cursor: {
              type: ["string", "null"],
              description: "Cursor that was used to retrieve this page.",
            },
            hasMore: {
              type: "boolean",
              description:
                "Whether more results are available after this page.",
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    text: {
      type: "string",
      description:
        "Markdown formatted summary of the search result for conversational surfaces.",
    },
  },
  additionalProperties: false,
} as const;

const createBookmarkInputSchema = {
  type: "object",
  required: ["type", "content"],
  properties: {
    type: { type: "string", enum: ["link", "text"] },
    title: { type: "string" },
    content: { type: "string" },
  },
  additionalProperties: false,
} as const;

const listSummarySchema = {
  type: "object",
  required: ["id", "name", "icon", "parentId", "type", "public"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: ["string", "null"] },
    icon: { type: "string" },
    parentId: { type: ["string", "null"] },
    type: { type: "string" },
    query: { type: ["string", "null"] },
    public: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const listCollectionResultSchema = {
  type: "object",
  required: ["lists"],
  properties: {
    lists: { type: "array", items: listSummarySchema },
  },
  additionalProperties: false,
} as const;

const createListInputSchema = {
  type: "object",
  required: ["name", "icon"],
  properties: {
    name: { type: "string" },
    icon: { type: "string" },
    parentId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const listMutationResultSchema = {
  type: "object",
  required: ["listId", "action", "message"],
  properties: {
    listId: { type: "string" },
    bookmarkId: { type: "string" },
    action: { type: "string", enum: ["added", "removed", "created"] },
    message: { type: "string" },
    list: listSummarySchema,
  },
  additionalProperties: false,
} as const;

const tagMutationInputSchema = {
  type: "object",
  required: ["bookmarkId", "tags"],
  properties: {
    bookmarkId: { type: "string" },
    tags: { type: "array", items: { type: "string" }, minItems: 1 },
  },
  additionalProperties: false,
} as const;

const tagMutationResultSchema = {
  type: "object",
  required: ["bookmarkId", "tags", "action", "message"],
  properties: {
    bookmarkId: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    action: { type: "string", enum: ["attached", "detached"] },
    message: { type: "string" },
  },
  additionalProperties: false,
} as const;

const errorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        code: { type: "string" },
        status: { type: "integer" },
      },
    },
  },
  additionalProperties: false,
} as const;

export function buildOpenApiSpec(basePath: string) {
  const serverUrl = basePath === "" ? "/" : basePath;

  return {
    openapi: "3.1.0",
    info: {
      title: "Karakeep MCP OpenAPI",
      version: "1.0.0",
      description:
        "HTTP interface for Karakeep MCP tools, exposing bookmark, list, and tag operations with JSON responses. Bookmark search supports Karakeep's query language with advanced qualifiers.",
    },
    servers: [
      {
        url: serverUrl,
      },
    ],
    components: {
      schemas: {
        BookmarkSummary: bookmarkSummarySchema,
        BookmarkContentResult: bookmarkContentSchema,
        SearchBookmarksInput: searchBookmarksInputSchema,
        SearchBookmarksResult: searchBookmarksResultSchema,
        CreateBookmarkInput: createBookmarkInputSchema,
        ListSummary: listSummarySchema,
        ListCollectionResult: listCollectionResultSchema,
        CreateListInput: createListInputSchema,
        ListMutationResult: listMutationResultSchema,
        TagMutationInput: tagMutationInputSchema,
        TagMutationResult: tagMutationResultSchema,
        ErrorResponse: errorResponseSchema,
      },
    },
    paths: {
      "/bookmarks/search": {
        post: {
          operationId: "searchBookmarks",
          summary: "Search bookmarks",
          tags: ["Bookmarks"],
          description: searchBookmarksOperationDescription,
          requestBody: {
            required: true,
            description:
              "Search criteria containing the query language string and optional pagination details.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SearchBookmarksInput" },
                examples: {
                  favouritedImportant: {
                    summary: "Favorited important bookmarks from 2023",
                    value: {
                      query:
                        "is:fav after:2023-01-01 before:2023-12-31 #important",
                      limit: 10,
                    },
                  },
                  machineLearning: {
                    summary: "Combine text search with a qualifier",
                    value: {
                      query: "machine learning is:fav",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Paginated search results including bookmark summaries, cursors, and a human-readable summary string.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/SearchBookmarksResult",
                  },
                },
              },
            },
            default: {
              description:
                "Error response returned when the search request fails.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/bookmarks": {
        post: {
          operationId: "createBookmark",
          summary: "Create a bookmark",
          tags: ["Bookmarks"],
          description:
            "Create a new link or text bookmark and return its normalized summary.",
          requestBody: {
            required: true,
            description:
              "Bookmark payload identifying the type (link or text) and its content.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateBookmarkInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "The created bookmark",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BookmarkSummary" },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/bookmarks/{bookmarkId}": {
        get: {
          operationId: "getBookmark",
          summary: "Get bookmark",
          tags: ["Bookmarks"],
          description:
            "Retrieve a bookmark summary by its identifier without loading content bodies.",
          parameters: [
            {
              name: "bookmarkId",
              in: "path",
              required: true,
              description: "Bookmark identifier.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Bookmark details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BookmarkSummary" },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/bookmarks/{bookmarkId}/content": {
        get: {
          operationId: "getBookmarkContent",
          summary: "Get bookmark content",
          tags: ["Bookmarks"],
          description:
            "Retrieve the markdown representation of a bookmark's stored content.",
          parameters: [
            {
              name: "bookmarkId",
              in: "path",
              required: true,
              description: "Bookmark identifier.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Bookmark content in markdown",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/BookmarkContentResult",
                  },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/lists": {
        get: {
          operationId: "listLists",
          summary: "List available lists",
          tags: ["Lists"],
          description: "Retrieve all lists the authenticated user can access.",
          responses: {
            "200": {
              description: "Collection of lists",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ListCollectionResult" },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
        post: {
          operationId: "createList",
          summary: "Create a new list",
          tags: ["Lists"],
          description:
            "Create a new list with a name, icon, and optional parent.",
          requestBody: {
            required: true,
            description:
              "New list details including name, icon, and optional parentId.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateListInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Created list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ListMutationResult" },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/lists/{listId}/bookmarks/{bookmarkId}": {
        post: {
          operationId: "addBookmarkToList",
          summary: "Add bookmark to list",
          tags: ["Lists"],
          description: "Add a bookmark to the specified list.",
          parameters: [
            {
              name: "listId",
              in: "path",
              required: true,
              description: "Target list identifier.",
              schema: { type: "string" },
            },
            {
              name: "bookmarkId",
              in: "path",
              required: true,
              description: "Bookmark identifier to add to the list.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Bookmark added",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ListMutationResult" },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
        delete: {
          operationId: "removeBookmarkFromList",
          summary: "Remove bookmark from list",
          tags: ["Lists"],
          description: "Remove a bookmark from the specified list.",
          parameters: [
            {
              name: "listId",
              in: "path",
              required: true,
              description: "Target list identifier.",
              schema: { type: "string" },
            },
            {
              name: "bookmarkId",
              in: "path",
              required: true,
              description: "Bookmark identifier to remove from the list.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Bookmark removed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ListMutationResult" },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/tags/attach": {
        post: {
          operationId: "attachTags",
          summary: "Attach tags to bookmark",
          tags: ["Tags"],
          description:
            "Attach one or more tags to a bookmark and return the resulting tag list.",
          requestBody: {
            required: true,
            description: "Bookmark identifier and tag list to attach.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TagMutationInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Tags attached",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TagMutationResult" },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/tags/detach": {
        post: {
          operationId: "detachTags",
          summary: "Detach tags from bookmark",
          tags: ["Tags"],
          description:
            "Remove one or more tags from a bookmark and return the updated tag list.",
          requestBody: {
            required: true,
            description: "Bookmark identifier and tag list to detach.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TagMutationInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Tags detached",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TagMutationResult" },
                },
              },
            },
            default: {
              description: "Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
    },
  } as const;
}

export function buildOpenApiConfig(basePath: string) {
  const prefix = basePath === "" ? "" : basePath;
  return {
    name: "Karakeep MCP",
    description: "Karakeep MCP OpenAPI surface compatible with Open WebUI.",
    schema: `${prefix}/openapi.json`,
    servers: [
      {
        url: prefix === "" ? "/" : prefix,
      },
    ],
    operations: [
      {
        operationId: "searchBookmarks",
        verb: "search",
        description:
          "Search bookmarks using Karakeep's query language with advanced qualifiers.",
      },
      {
        operationId: "searchBookmarks",
        verb: "cursor",
        description:
          "Retrieve the next page of results from a previous searchBookmarks response.",
      },
      {
        operationId: "getBookmark",
        verb: "get",
        description: "Fetch a bookmark summary by identifier.",
      },
      {
        operationId: "createBookmark",
        verb: "create",
        description: "Create a new link or text bookmark.",
      },
      {
        operationId: "getBookmarkContent",
        verb: "get",
        description: "Retrieve markdown content for a bookmark.",
      },
      {
        operationId: "listLists",
        verb: "list",
        description: "List the user's available lists.",
      },
      {
        operationId: "createList",
        verb: "create",
        description: "Create a new list for organizing bookmarks.",
      },
      {
        operationId: "addBookmarkToList",
        verb: "update",
        description: "Add an existing bookmark to a list.",
      },
      {
        operationId: "removeBookmarkFromList",
        verb: "delete",
        description: "Remove a bookmark from a list.",
      },
      {
        operationId: "attachTags",
        verb: "update",
        description: "Attach one or more tags to a bookmark.",
      },
      {
        operationId: "detachTags",
        verb: "update",
        description: "Detach one or more tags from a bookmark.",
      },
    ],
  } as const;
}
