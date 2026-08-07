# syntax=docker/dockerfile:1

# --- deps ---
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile --filter @basketeasy/web... || pnpm install --filter @basketeasy/web...

# --- build ---
FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY --from=deps /workspace ./
COPY packages/types packages/types
COPY apps/web apps/web
RUN pnpm --filter @basketeasy/web build

# --- runtime: static files served by nginx ---
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
