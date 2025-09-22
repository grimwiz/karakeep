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
  required: ["query"],
  properties: {
    query: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    nextCursor: { type: "string" },
  },
  additionalProperties: false,
} as const;

const searchBookmarksResultSchema = {
  type: "object",
  required: ["bookmarks", "nextCursor", "text"],
  properties: {
    bookmarks: { type: "array", items: bookmarkSummarySchema },
    nextCursor: { type: ["string", "null"] },
    text: { type: "string" },
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
        "HTTP interface for Karakeep MCP tools, exposing bookmark, list, and tag operations with JSON responses.",
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
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SearchBookmarksInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "A paginated list of bookmarks",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/SearchBookmarksResult",
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
      "/bookmarks": {
        post: {
          operationId: "createBookmark",
          summary: "Create a bookmark",
          requestBody: {
            required: true,
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
          parameters: [
            {
              name: "bookmarkId",
              in: "path",
              required: true,
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
          parameters: [
            {
              name: "bookmarkId",
              in: "path",
              required: true,
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
          requestBody: {
            required: true,
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
          parameters: [
            {
              name: "listId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "bookmarkId",
              in: "path",
              required: true,
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
          parameters: [
            {
              name: "listId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "bookmarkId",
              in: "path",
              required: true,
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
          requestBody: {
            required: true,
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
          requestBody: {
            required: true,
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
      { operationId: "searchBookmarks", verb: "search" },
      { operationId: "searchBookmarks", verb: "cursor" },
      { operationId: "getBookmark", verb: "get" },
      { operationId: "createBookmark", verb: "create" },
      { operationId: "getBookmarkContent", verb: "get" },
      { operationId: "listLists", verb: "list" },
      { operationId: "createList", verb: "create" },
      { operationId: "addBookmarkToList", verb: "update" },
      { operationId: "removeBookmarkFromList", verb: "delete" },
      { operationId: "attachTags", verb: "update" },
      { operationId: "detachTags", verb: "update" },
    ],
  } as const;
}
