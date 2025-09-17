# syntax=docker/dockerfile:1.7-labs
FROM node:22-alpine AS base

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable \
  && apk add --no-cache libc6-compat python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY tooling/prettier/package.json tooling/prettier/package.json
COPY tooling/typescript/package.json tooling/typescript/package.json

RUN pnpm install --filter @karakeep/mcp... --frozen-lockfile

FROM base AS build

COPY apps/mcp apps/mcp
COPY packages/sdk packages/sdk
COPY tooling/prettier tooling/prettier
COPY tooling/typescript tooling/typescript

RUN pnpm --filter @karakeep/sdk... build
RUN pnpm --filter @karakeep/mcp... build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

ARG KARAKEEP_API_ADDR=https://demo.karakeep.local
ARG KARAKEEP_API_KEY=demo-api-key

ENV KARAKEEP_API_ADDR=${KARAKEEP_API_ADDR}
ENV KARAKEEP_API_KEY=${KARAKEEP_API_KEY}

COPY --from=build /app/apps/mcp/dist ./dist

EXPOSE 3333

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--openapi", "--port", "3333", "--host", "0.0.0.0"]
