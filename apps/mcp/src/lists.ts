import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { withToolLogging } from "./logging";
import { karakeepClient } from "./shared";
import {
  extractApiError,
  ListSummary,
  ServiceError,
  toListSummary,
  toMcpToolError,
} from "./utils";

export const ListIdSchema = z.string();

export type ListId = z.infer<typeof ListIdSchema>;

export const BookmarkListMutationSchema = z.object({
  listId: ListIdSchema,
  bookmarkId: z.string(),
});

export type BookmarkListMutationInput = z.infer<
  typeof BookmarkListMutationSchema
>;

export const CreateListInputSchema = z.object({
  name: z.string(),
  icon: z.string(),
  parentId: z.string().optional(),
});

export type CreateListInput = z.infer<typeof CreateListInputSchema>;

export interface ListCollectionResult {
  lists: ListSummary[];
}

export interface ListMutationResult {
  listId: string;
  bookmarkId?: string;
  action: "added" | "removed" | "created";
  message: string;
  list?: ListSummary;
}

export async function getLists(): Promise<ListCollectionResult> {
  const res = await karakeepClient.GET("/lists", { params: {} });

  if (!res.data) {
    const apiError = extractApiError(res);
    throw new ServiceError(apiError?.message ?? "Failed to load lists", {
      code: apiError?.code,
      details: apiError?.raw ?? res,
      status: 400,
    });
  }

  return {
    lists: res.data.lists.map(toListSummary),
  };
}

export async function addBookmarkToList(
  input: BookmarkListMutationInput,
): Promise<ListMutationResult> {
  const res = await karakeepClient.PUT(
    `/lists/{listId}/bookmarks/{bookmarkId}`,
    {
      params: {
        path: {
          listId: input.listId,
          bookmarkId: input.bookmarkId,
        },
      },
    },
  );

  if (res.error) {
    const apiError = extractApiError(res);
    throw new ServiceError(
      apiError?.message ?? "Failed to add bookmark to list",
      {
        code: apiError?.code,
        details: apiError?.raw ?? res,
        status: 400,
      },
    );
  }

  return {
    listId: input.listId,
    bookmarkId: input.bookmarkId,
    action: "added",
    message: `Bookmark ${input.bookmarkId} added to list ${input.listId}`,
  };
}

export async function removeBookmarkFromList(
  input: BookmarkListMutationInput,
): Promise<ListMutationResult> {
  const res = await karakeepClient.DELETE(
    `/lists/{listId}/bookmarks/{bookmarkId}`,
    {
      params: {
        path: {
          listId: input.listId,
          bookmarkId: input.bookmarkId,
        },
      },
    },
  );

  if (res.error) {
    const apiError = extractApiError(res);
    throw new ServiceError(
      apiError?.message ?? "Failed to remove bookmark from list",
      {
        code: apiError?.code,
        details: apiError?.raw ?? res,
        status: 400,
      },
    );
  }

  return {
    listId: input.listId,
    bookmarkId: input.bookmarkId,
    action: "removed",
    message: `Bookmark ${input.bookmarkId} removed from list ${input.listId}`,
  };
}

export async function createList(
  input: CreateListInput,
): Promise<ListMutationResult> {
  const res = await karakeepClient.POST("/lists", {
    body: {
      name: input.name,
      icon: input.icon,
      parentId: input.parentId,
    },
  });

  if (!res.data) {
    const apiError = extractApiError(res);
    throw new ServiceError(apiError?.message ?? "Failed to create list", {
      code: apiError?.code,
      details: apiError?.raw ?? res,
      status: 400,
    });
  }

  const listSummary = toListSummary(res.data);

  return {
    listId: listSummary.id,
    action: "created",
    message: `List ${listSummary.name} created with id ${listSummary.id}`,
    list: listSummary,
  };
}

export function registerListTools(server: McpServer) {
  server.tool(
    "get-lists",
    `Retrieves a list of lists.`,
    withToolLogging("get-lists", async (): Promise<CallToolResult> => {
      try {
        const result = await getLists();
        return {
          content: [
            {
              type: "text",
              text: result.lists
                .map(
                  (list) =>
                    `List ID: ${list.id}\nName: ${list.name}\nIcon: ${list.icon}\nDescription: ${list.description ?? ""}\nParent ID: ${list.parentId ?? ""}`,
                )
                .join("\n\n"),
            },
          ],
          structuredContent: {
            lists: result.lists,
          },
        };
      } catch (error) {
        return toMcpToolError(error);
      }
    }),
  );

  server.tool(
    "add-bookmark-to-list",
    `Add a bookmark to a list.`,
    {
      listId: z.string().describe(`The listId to add the bookmark to.`),
      bookmarkId: z.string().describe(`The bookmarkId to add.`),
    },
    withToolLogging(
      "add-bookmark-to-list",
      async ({ listId, bookmarkId }): Promise<CallToolResult> => {
        try {
          const result = await addBookmarkToList({ listId, bookmarkId });
          return {
            content: [
              {
                type: "text",
                text: result.message,
              },
            ],
            structuredContent: { result },
          };
        } catch (error) {
          return toMcpToolError(error);
        }
      },
    ),
  );

  server.tool(
    "remove-bookmark-from-list",
    `Remove a bookmark from a list.`,
    {
      listId: z.string().describe(`The listId to remove the bookmark from.`),
      bookmarkId: z.string().describe(`The bookmarkId to remove.`),
    },
    withToolLogging(
      "remove-bookmark-from-list",
      async ({ listId, bookmarkId }): Promise<CallToolResult> => {
        try {
          const result = await removeBookmarkFromList({ listId, bookmarkId });
          return {
            content: [
              {
                type: "text",
                text: result.message,
              },
            ],
            structuredContent: { result },
          };
        } catch (error) {
          return toMcpToolError(error);
        }
      },
    ),
  );

  server.tool(
    "create-list",
    `Create a list.`,
    {
      name: z.string().describe(`The name of the list.`),
      icon: z.string().describe(`The emoji icon of the list.`),
      parentId: z
        .string()
        .optional()
        .describe(`The parent list id of this list.`),
    },
    withToolLogging(
      "create-list",
      async ({ name, icon, parentId }): Promise<CallToolResult> => {
        try {
          const result = await createList({ name, icon, parentId });
          return {
            content: [
              {
                type: "text",
                text: result.message,
              },
            ],
            structuredContent: { result },
          };
        } catch (error) {
          return toMcpToolError(error);
        }
      },
    ),
  );
}
