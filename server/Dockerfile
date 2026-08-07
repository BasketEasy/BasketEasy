# syntax=docker/dockerfile:1

# --- deps: install full workspace deps once, reused by build stage ---
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY server/package.json server/package.json
COPY packages/@basketeasy/types/package.json packages/@basketeasy/types/package.json
RUN pnpm install --frozen-lockfile --filter @basketeasy/server... || pnpm install --filter @basketeasy/server...

# --- build: compile TypeScript to dist ---
FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY --from=deps /workspace ./
COPY packages/@basketeasy/types packages/@basketeasy/types
COPY server server
RUN pnpm --filter @basketeasy/server build

# --- runtime: minimal image, prod deps only ---
FROM node:20-alpine AS runtime
WORKDIR /server
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /workspace/server/dist ./dist
COPY --from=build /workspace/server/package.json ./package.json
COPY --from=build /workspace/packages/@basketeasy/types ./packages/@basketeasy/types
COPY --from=build /workspace/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]
