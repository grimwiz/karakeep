import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerBookmarkTools } from "./bookmarks";
import { registerListTools } from "./lists";
import { registerTagTools } from "./tags";

export function createMcpServer() {
  const server = new McpServer({
    name: "Karakeep",
    version: "0.23.0",
  });

  registerBookmarkTools(server);
  registerListTools(server);
  registerTagTools(server);

  return server;
}
