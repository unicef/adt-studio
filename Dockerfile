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

COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/studio/src apps/studio/src
COPY apps/studio/tsconfig.json apps/studio/tsconfig.json
COPY apps/studio/index.html apps/studio/index.html
COPY apps/studio/vite.config.ts apps/studio/vite.config.ts
COPY apps/studio/components.json apps/studio/components.json

# Build all TypeScript packages (tsc --build)
RUN pnpm build

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

# Copy node_modules (includes workspace symlinks)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/llm/node_modules ./packages/llm/node_modules
COPY --from=deps /app/packages/pdf/node_modules ./packages/pdf/node_modules
COPY --from=deps /app/packages/storage/node_modules ./packages/storage/node_modules
COPY --from=deps /app/packages/pipeline/node_modules ./packages/pipeline/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Copy built output
COPY --from=build /app/packages/ ./packages/
COPY --from=build /app/apps/api/ ./apps/api/

# Copy root package.json (needed for workspace resolution)
COPY package.json pnpm-workspace.yaml ./

# Create data directories (will be mounted as volumes)
RUN mkdir -p /app/books /app/prompts && \
    chown -R appuser:nodejs /app/books

ENV NODE_ENV=production
ENV PROJECT_ROOT=/app
ENV BOOKS_DIR=/app/books
ENV PROMPTS_DIR=/app/prompts
ENV CONFIG_PATH=/app/config.yaml
ENV PORT=3001

EXPOSE 3001

USER appuser

CMD ["node", "apps/api/dist/index.js"]

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
