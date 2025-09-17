# Karakeep MCP Server

This is the Karakeep MCP server, which is a server that can be used to interact with Karakeep from other tools.

## Supported Tools

- Searching bookmarks
- Adding and removing bookmarks from lists
- Attaching and detaching tags to bookmarks
- Creating new lists
- Creating text and URL bookmarks

Currently, the MCP server only exposes tools (no resources).

## Usage with Claude Desktop

From NPM:

```json
{
  "mcpServers": {
    "karakeep": {
      "command": "npx",
      "args": [
        "@karakeep/mcp",
      ],
      "env": {
        "KARAKEEP_API_ADDR": "https://<YOUR_SERVER_ADDR>",
        "KARAKEEP_API_KEY": "<YOUR_TOKEN>"
      }
    }
  }
}
```

From Docker:

```json
{
  "mcpServers": {
    "karakeep": {
      "command": "docker",
      "args": [
        "run",
        "-e",
        "KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR>",
        "-e",
        "KARAKEEP_API_KEY=<YOUR_TOKEN>",
        "ghcr.io/karakeep-app/karakeep-mcp:latest"
      ]
    }
  }
}
```

### Local testing with Docker from source

The repository includes a multi-stage Dockerfile under
`apps/mcp/docker/Dockerfile` that builds the MCP server directly from the
workspace. The Dockerfile sets `KARAKEEP_API_ADDR` and `KARAKEEP_API_KEY` during
the build so the resulting image is ready to exercise the tools. Follow the
[Docker README](./docker/README.md) for commands that build the image and run it
in OpenAPI or stdio mode.

## Running as an HTTP server

In addition to the standard stdio-based transport, the CLI can expose the MCP
tools through a lightweight OpenAPI surface that returns JSON responses. This
mode is designed for integrations such as Open WebUI that expect OpenAPI
metadata (including a `cursor` verb) instead of the MCP streamable transport.

Start the HTTP server by passing the `--openapi` flag (or by setting the
environment variable `KARAKEEP_MCP_TRANSPORT=openapi`). The legacy `--http`
flag still works as an alias.

```
karakeep-mcp --openapi --port 3333 --host 0.0.0.0 --path /mcp
```

By default the server listens on `0.0.0.0:3000` and exposes its endpoints under
`/mcp`. The following options/environment variables are supported:

- `--port` / `KARAKEEP_MCP_PORT` (or `PORT`): change the listening port.
- `--host` / `KARAKEEP_MCP_HOST`: change the host/interface.
- `--path` / `KARAKEEP_MCP_PATH`: change the base path for HTTP requests.
- `--transport` / `KARAKEEP_MCP_TRANSPORT`: choose between `stdio` and
  `openapi`.

When running in OpenAPI mode, the server serves:

- `${path}/openapi.json` – the OpenAPI schema describing all bookmark, list,
  and tag operations, with JSON request/response payloads.
- `${path}/openapi.conf` – a helper configuration file for Open WebUI that
  maps operations (including the `cursor` verb) to their OpenAPI
  `operationId`s.

All HTTP responses include structured JSON, so no external shim is required to
consume the tool results.
