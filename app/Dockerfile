# syntax=docker/dockerfile:1

# --- deps ---
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY app/package.json app/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile --filter @basketeasy/app... || pnpm install --filter @basketeasy/app...

# --- build ---
FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY --from=deps /workspace ./
COPY packages/types packages/types
COPY app app
RUN pnpm --filter @basketeasy/app build

# --- runtime: static files served by nginx ---
FROM nginx:1.27-alpine AS runtime
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
