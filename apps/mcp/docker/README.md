# Docker testing image for the Karakeep MCP server

This directory contains a standalone Dockerfile that builds the `@karakeep/mcp`
package and bakes default API credentials into the resulting container. The
image is intended for local testing of the MCP tools without needing to install
Node.js or pnpm on the host machine.

## Building the image

Pass your Karakeep API endpoint and key as build arguments so the Dockerfile can
set `KARAKEEP_API_ADDR` and `KARAKEEP_API_KEY` during the image build. Placeholder
values are provided in the Dockerfile so the build succeeds even without
overrides, but they should be replaced with working credentials when running the
tools.

```bash
docker build \
  -f apps/mcp/docker/Dockerfile \
  -t karakeep-mcp-test \
  --build-arg KARAKEEP_API_ADDR=https://api.example.com \
  --build-arg KARAKEEP_API_KEY=example-token \
  .
```

## Running the MCP server

The container defaults to starting the MCP server in OpenAPI mode on port 3333.
Expose the port to your host and run the image to begin testing the tools.

```bash
docker run --rm -p 3333:3333 karakeep-mcp-test
```

You can supply different credentials at runtime (for example, when rotating
tokens) by overriding the environment variables.

```bash
docker run --rm \
  -p 3333:3333 \
  -e KARAKEEP_API_ADDR=https://api.example.com \
  -e KARAKEEP_API_KEY=another-token \
  karakeep-mcp-test
```

If you prefer to interact with the MCP server over stdio, override the default
command and keep the container attached to your terminal.

```bash
docker run --rm -it karakeep-mcp-test --stdio
```

With the server running, you can point compatible MCP clients (for example,
Claude Desktop or Open WebUI) at `http://localhost:3333/mcp` to exercise the
Karakeep tooling.
