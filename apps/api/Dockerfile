# syntax=docker/dockerfile:1

# --- deps: install full workspace deps once, reused by build stage ---
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile --filter @basketeasy/api... || pnpm install --filter @basketeasy/api...

# --- build: compile TypeScript to dist ---
FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY --from=deps /workspace ./
COPY packages/types packages/types
COPY apps/api apps/api
RUN pnpm --filter @basketeasy/api build

# --- runtime: minimal image, prod deps only ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/packages/types ./packages/types
COPY --from=build /workspace/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]
