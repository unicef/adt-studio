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

# Copy root manifests, then use a bind-mount + find to copy every workspace
# package.json while preserving directory structure — no edits needed when
# packages or apps are added to the workspace.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=bind,source=.,target=/ctx \
    find /ctx/packages /ctx/apps -maxdepth 2 -name "package.json" \
         -not -path "*/node_modules/*" \
         -exec sh -c 'f="$1"; dst="${f#/ctx/}"; mkdir -p "$(dirname "$dst")"; cp "$f" "$dst"' _ {} \;

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: Build — compile TypeScript + Vite SPA
# =============================================================================
FROM deps AS build

# Copy full source (preserve node_modules from deps stage).
# Directory-level copies: adding a new package or app requires no Dockerfile changes.
# .dockerignore excludes node_modules/, dist/, apps/desktop/, and other build artifacts.
COPY tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY apps/studio/ ./apps/studio/

# Read-only code assets required during build (prompts, templates, global config)
COPY prompts/ ./prompts/
COPY templates/ ./templates/
COPY config.yaml ./config.yaml

# Build all TypeScript packages (tsc --build — type-checks + compiles shared packages)
RUN pnpm build

# Bundle the API with esbuild (produces dist/api-server.mjs with correct ESM imports)
RUN pnpm --filter @adt/api build:server

# esbuild, tailwindcss, and postcss are dynamically imported by the packaging stage and
# cannot be bundled — they locate native binaries and CSS assets relative to their own
# package directory, which breaks when inlined into the bundle. Install all three with
# their full dependency tree into dist/node_modules/ using npm (not pnpm — npm ignores
# the monorepo workspace config and installs freely into a non-workspace directory).
# npm also installs @esbuild/linux-x64 automatically as esbuild's optional dependency.
# Versions are read directly from packages/pipeline/package.json to avoid drift.
RUN --mount=type=cache,target=/root/.npm \
    node -e " \
      const p = JSON.parse(require('fs').readFileSync('packages/pipeline/package.json', 'utf8')); \
      require('fs').writeFileSync('apps/api/dist/package.json', JSON.stringify({ \
        name: 'api-runtime', version: '0.0.0', \
        dependencies: { \
          esbuild: p.devDependencies.esbuild, \
          tailwindcss: p.dependencies.tailwindcss, \
          postcss: p.dependencies.postcss \
        } \
      })); \
    " && \
    npm install --prefix apps/api/dist --omit=dev --cache /root/.npm && \
    rm -f apps/api/dist/package.json apps/api/dist/package-lock.json

# Build the studio SPA (Vite)
RUN pnpm --filter @adt/studio build

# Copy additional runtime assets (presets, voices, styleguides, web assets).
# Keeping these after build preserves Docker layer cache for pnpm build.
COPY config/ ./config/
COPY assets/ ./assets/

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

# Baked-in defaults (overridable via volume mounts at runtime).
# If a NEW top-level runtime directory is added to the repo (e.g. voices/, styleguides/),
# add a corresponding COPY --from=build line here and in the app stage below.
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

# Baked-in defaults (overridable via volume mounts at runtime).
# If a NEW top-level runtime directory is added to the repo (e.g. voices/, styleguides/),
# add a corresponding COPY --from=build line here and in the api stage above.
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
