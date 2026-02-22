# =============================================================================
# Stage 1: Base — Node.js with pnpm enabled
# =============================================================================
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.18.1 --activate

WORKDIR /app

# =============================================================================
# Stage 2: Dependencies — install with lockfile
# =============================================================================
FROM base AS deps

# Copy only files needed for pnpm install (maximizes Docker layer cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/pdf/package.json packages/pdf/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
# COPY packages/output/package.json packages/output/package.json  # uncomment when package is initialized
COPY apps/api/package.json apps/api/package.json
COPY apps/studio/package.json apps/studio/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: Build — compile TypeScript + Vite SPA
# =============================================================================
FROM deps AS build

# Copy full source (preserve node_modules from deps stage)
COPY tsconfig.json ./

# Copy package sources (exclude node_modules to preserve installed deps)
COPY packages/types/src packages/types/src
COPY packages/types/tsconfig.json packages/types/tsconfig.json
COPY packages/llm/src packages/llm/src
COPY packages/llm/tsconfig.json packages/llm/tsconfig.json
COPY packages/pdf/src packages/pdf/src
COPY packages/pdf/tsconfig.json packages/pdf/tsconfig.json
COPY packages/storage/src packages/storage/src
COPY packages/storage/tsconfig.json packages/storage/tsconfig.json
COPY packages/pipeline/src packages/pipeline/src
COPY packages/pipeline/tsconfig.json packages/pipeline/tsconfig.json
# COPY packages/output/src packages/output/src                    # uncomment when package is initialized
# COPY packages/output/tsconfig.json packages/output/tsconfig.json

COPY apps/api/src apps/api/src
COPY apps/api/scripts apps/api/scripts
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/studio/src apps/studio/src
COPY apps/studio/tsconfig.json apps/studio/tsconfig.json
COPY apps/studio/index.html apps/studio/index.html
COPY apps/studio/vite.config.ts apps/studio/vite.config.ts
COPY apps/studio/components.json apps/studio/components.json

# Copy read-only code assets (prompts, templates, global config, presets, styleguides)
COPY prompts/ ./prompts/
COPY templates/ ./templates/
COPY config.yaml ./config.yaml
COPY config/ ./config/
COPY assets/ ./assets/

# Build all TypeScript packages (tsc --build — type-checks + compiles shared packages)
RUN pnpm build

# Bundle the API with esbuild (produces dist/api-server.mjs with correct ESM imports)
RUN pnpm --filter @adt/api build:server

# Build the studio SPA (Vite)
RUN pnpm --filter @adt/studio build

# =============================================================================
# Stage 4: API — production Node.js server
# =============================================================================
FROM base AS api

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs appuser

WORKDIR /app

# The esbuild bundle is self-contained — no node_modules or packages/ needed at runtime.
# WASM files are copied into dist/ by the build:server script.
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Copy baked-in defaults (overridable via volume mounts at runtime)
COPY --from=build /app/prompts/ ./prompts/
COPY --from=build /app/templates/ ./templates/
COPY --from=build /app/config.yaml ./config.yaml
COPY --from=build /app/config/ ./config/
COPY --from=build /app/assets/ ./assets/

# Create books directory (mounted as volume for user data)
RUN mkdir -p /app/books && \
    chown -R appuser:nodejs /app/books

ENV NODE_ENV=production
ENV PROJECT_ROOT=/app
ENV BOOKS_DIR=/app/books
ENV PROMPTS_DIR=/app/prompts
ENV TEMPLATES_DIR=/app/templates
ENV CONFIG_PATH=/app/config.yaml
ENV PORT=3001

EXPOSE 3001

USER appuser

CMD ["node", "apps/api/dist/api-server.mjs"]

# =============================================================================
# Stage 5: Studio — nginx serving the built SPA
# =============================================================================
FROM nginx:alpine AS studio

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built SPA assets
COPY --from=build /app/apps/studio/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# =============================================================================
# Stage 6: App — single combined image for registry distribution
#
# API (Node.js) + Studio (nginx) in one container.
# Users run: docker run -p 8080:80 -v ./books:/app/books ghcr.io/unicef/adt-studio
# No repo clone or docker-compose needed.
# =============================================================================
FROM node:22-alpine AS app

RUN apk add --no-cache nginx

WORKDIR /app

# API bundle (self-contained — no node_modules needed)
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Studio SPA
COPY --from=build /app/apps/studio/dist /usr/share/nginx/html

# nginx config — proxies /api/* to localhost:3001
COPY docker/nginx-single.conf /etc/nginx/http.d/default.conf

# Entrypoint — starts Node.js then nginx
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Baked-in defaults (overridable via volume mounts at runtime)
COPY --from=build /app/prompts/ ./prompts/
COPY --from=build /app/templates/ ./templates/
COPY --from=build /app/config.yaml ./config.yaml
COPY --from=build /app/config/ ./config/
COPY --from=build /app/assets/ ./assets/

RUN mkdir -p /app/books && chown -R node:node /app/books

ENV NODE_ENV=production
ENV PROJECT_ROOT=/app
ENV BOOKS_DIR=/app/books
ENV PROMPTS_DIR=/app/prompts
ENV TEMPLATES_DIR=/app/templates
ENV CONFIG_PATH=/app/config.yaml
ENV PORT=3001

EXPOSE 80

CMD ["/entrypoint.sh"]
