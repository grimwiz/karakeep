import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { karakeepClient } from "./shared";
import { extractApiError, ServiceError, toMcpToolError } from "./utils";

export const TagMutationInputSchema = z.object({
  bookmarkId: z.string(),
  tags: z.array(z.string()).min(1),
});

export type TagMutationInput = z.infer<typeof TagMutationInputSchema>;

export interface TagMutationResult {
  bookmarkId: string;
  tags: string[];
  action: "attached" | "detached";
  message: string;
}

export async function attachTagsToBookmark(
  input: TagMutationInput,
): Promise<TagMutationResult> {
  const res = await karakeepClient.POST(`/bookmarks/{bookmarkId}/tags`, {
    params: {
      path: {
        bookmarkId: input.bookmarkId,
      },
    },
    body: {
      tags: input.tags.map((tag) => ({ tagName: tag })),
    },
  });

  if (res.error) {
    const apiError = extractApiError(res);
    throw new ServiceError(apiError?.message ?? "Failed to attach tags", {
      code: apiError?.code,
      details: apiError?.raw ?? res,
      status: 400,
    });
  }

  return {
    bookmarkId: input.bookmarkId,
    tags: input.tags,
    action: "attached",
    message: `Tags ${JSON.stringify(input.tags)} attached to bookmark ${input.bookmarkId}`,
  };
}

export async function detachTagsFromBookmark(
  input: TagMutationInput,
): Promise<TagMutationResult> {
  const res = await karakeepClient.DELETE(`/bookmarks/{bookmarkId}/tags`, {
    params: {
      path: {
        bookmarkId: input.bookmarkId,
      },
    },
    body: {
      tags: input.tags.map((tag) => ({ tagName: tag })),
    },
  });

  if (res.error) {
    const apiError = extractApiError(res);
    throw new ServiceError(apiError?.message ?? "Failed to detach tags", {
      code: apiError?.code,
      details: apiError?.raw ?? res,
      status: 400,
    });
  }

  return {
    bookmarkId: input.bookmarkId,
    tags: input.tags,
    action: "detached",
    message: `Tags ${JSON.stringify(input.tags)} detached from bookmark ${input.bookmarkId}`,
  };
}

export function registerTagTools(server: McpServer) {
  server.tool(
    "attach-tag-to-bookmark",
    `Attach a tag to a bookmark.`,
    {
      bookmarkId: z.string().describe(`The bookmarkId to attach the tag to.`),
      tagsToAttach: z.array(z.string()).describe(`The tag names to attach.`),
    },
    async ({ bookmarkId, tagsToAttach }): Promise<CallToolResult> => {
      try {
        const result = await attachTagsToBookmark({
          bookmarkId,
          tags: tagsToAttach,
        });
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
  );

  server.tool(
    "detach-tag-from-bookmark",
    `Detach a tag from a bookmark.`,
    {
      bookmarkId: z.string().describe(`The bookmarkId to detach the tag from.`),
      tagsToDetach: z.array(z.string()).describe(`The tag names to detach.`),
    },
    async ({ bookmarkId, tagsToDetach }): Promise<CallToolResult> => {
      try {
        const result = await detachTagsFromBookmark({
          bookmarkId,
          tags: tagsToDetach,
        });
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
  );
}
