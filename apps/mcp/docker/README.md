# Docker testing image for the Karakeep MCP server

This directory contains a standalone Dockerfile that builds the `@karakeep/mcp`
package and bakes default API credentials into the resulting container. The
image is intended for local testing of the MCP tools without needing to install
Node.js or pnpm on the host machine. The Dockerfile sets placeholder values for
`KARAKEEP_API_ADDR` and `KARAKEEP_API_KEY`, but you should pass real credentials
when running the container.

## Building the image

```bash
docker build \
  -f apps/mcp/docker/Dockerfile \
  -t karakeep-mcp-test \
  .
```

## Running the MCP server

The container defaults to starting the MCP server in OpenAPI mode on port 3333.
Expose the port to your host and supply the Karakeep API credentials as
environment variables when running the image.

```bash
docker run --rm \
  -p 3333:3333 \
  -e KARAKEEP_API_ADDR=https://api.example.com \
  -e KARAKEEP_API_KEY=another-token \
  karakeep-mcp-test
```

If you are testing with the demo service, you can rely on the baked-in defaults
and omit the `-e` flags.

If you prefer to interact with the MCP server over stdio, override the default
command and keep the container attached to your terminal.

```bash
docker run --rm -it karakeep-mcp-test --stdio
```

With the server running, you can point compatible MCP clients (for example,
Claude Desktop or Open WebUI) at `http://localhost:3333/mcp` to exercise the
Karakeep tooling.
