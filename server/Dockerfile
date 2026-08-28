# syntax=docker/dockerfile:1

# --- deps: install full workspace deps once, reused by build stage ---
FROM node:24-alpine AS deps
WORKDIR /workspace
RUN corepack enable
# argon2 ships prebuilt binaries per platform/libc, but falls back to a
# node-gyp source build (needs python3/make/g++) when no matching prebuild
# is found — install these so that fallback doesn't crash-loop the build.
RUN apk add --no-cache python3 make g++
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY server/package.json server/package.json
COPY server/prisma server/prisma
COPY packages/@basketeasy/types/package.json packages/@basketeasy/types/package.json
RUN pnpm install --frozen-lockfile --filter @basketeasy/server... || pnpm install --filter @basketeasy/server...

# --- dev: hot reload via docker-compose.dev.yml ---
#
# Built from `deps` (already has devDependencies like @nestjs/cli installed
# for the filtered workspace). No source is COPYed in — docker-compose.dev.yml
# bind-mounts server/ and packages/ over this at container start, and nest's
# --watch picks up changes live. See docker-compose.dev.yml for the volumes
# that protect node_modules from being shadowed by those bind mounts.
#
# schema.prisma only exists once the bind mount lands, so the Prisma client
# generate + migrate deploy have to run at container start (not build time).
FROM deps AS dev
WORKDIR /workspace
CMD ["sh", "-c", "server/node_modules/.bin/prisma generate --schema=server/prisma/schema.prisma && server/node_modules/.bin/prisma migrate deploy --schema=server/prisma/schema.prisma && pnpm --filter @basketeasy/server start:dev"]

# --- build: compile TypeScript to dist ---
FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY --from=deps /workspace ./
COPY packages/@basketeasy/types packages/@basketeasy/types
COPY server server
RUN pnpm --filter @basketeasy/server build

# --- runtime: minimal image, prod deps only ---
#
# pnpm workspaces resolve each package's dependencies via symlinks that live
# in that package's own node_modules (e.g. server/node_modules/@nestjs/core),
# pointing back into the root node_modules/.pnpm store. Both layers have to
# be copied together, in the same relative layout they were created in, or
# Node's module resolution can't walk from server/dist up to a node_modules
# directory that actually has the symlink. So this stage keeps the
# /workspace root instead of flattening into /server.
FROM node:24-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/server/node_modules ./server/node_modules
COPY --from=build /workspace/server/dist ./server/dist
COPY --from=build /workspace/server/package.json ./server/package.json
COPY --from=build /workspace/server/prisma ./server/prisma
COPY --from=build /workspace/packages/@basketeasy/types ./packages/@basketeasy/types

EXPOSE 3000
CMD ["sh", "-c", "server/node_modules/.bin/prisma migrate deploy --schema=server/prisma/schema.prisma && node server/dist/main.js"]
