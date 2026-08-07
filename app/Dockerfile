# syntax=docker/dockerfile:1

# --- deps ---
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY app/package.json app/package.json
COPY packages/@basketeasy/types/package.json packages/@basketeasy/types/package.json
RUN pnpm install --frozen-lockfile --filter @basketeasy/app... || pnpm install --filter @basketeasy/app...

# --- dev: hot reload via docker-compose.dev.yml ---
#
# Built from `deps`. No source is COPYed in — docker-compose.dev.yml
# bind-mounts app/ and packages/ over this at container start, and Vite's
# dev server + HMR pick up changes live. host: true is set in vite.config.ts
# (not passed as a CLI flag here) so the dev server is reachable from outside
# the container — pnpm doesn't cleanly strip a `--` separator when a command
# is exec'd directly as a Docker CMD array instead of through a shell.
FROM deps AS dev
WORKDIR /workspace
CMD ["pnpm", "--filter", "@basketeasy/app", "dev"]

# --- build ---
FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY --from=deps /workspace ./
COPY packages/@basketeasy/types packages/@basketeasy/types
COPY app app
RUN pnpm --filter @basketeasy/app build

# --- runtime: static files served by nginx ---
FROM nginx:1.27-alpine AS runtime
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
