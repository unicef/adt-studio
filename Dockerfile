# =============================================================================
# Stage 1: Base — Node.js with pnpm enabled
# =============================================================================
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

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
COPY apps/adt-runtime/ ./apps/adt-runtime/

# Read-only code assets required during build (prompts, templates, global config)
COPY prompts/ ./prompts/
COPY templates/ ./templates/
COPY config.yaml ./config.yaml

# Build all TypeScript packages (tsc --build — type-checks + compiles shared packages)
RUN pnpm build

# Bundle the API with esbuild (produces dist/api-server.mjs with correct ESM imports)
RUN pnpm --filter @adt/api build:server

# esbuild, tailwindcss, postcss, and playwright are dynamically imported by the packaging
# stage and cannot be bundled — they locate native binaries and CSS assets relative to
# their own package directory, which breaks when inlined into the bundle. Install them
# with their full dependency tree into dist/node_modules/ using npm (not pnpm — npm
# ignores the monorepo workspace config and installs freely into a non-workspace
# directory). npm also installs @esbuild/linux-x64 automatically as esbuild's optional
# dependency. @anthropic-ai/claude-agent-sdk is here for the same reason: it resolves its
# platform-specific `claude` executable through its own optional dependencies. Versions are
# read directly from the owning workspace package.json to avoid drift.
RUN --mount=type=cache,target=/root/.npm \
    node -e " \
      const p = JSON.parse(require('fs').readFileSync('packages/pipeline/package.json', 'utf8')); \
      const l = JSON.parse(require('fs').readFileSync('packages/llm/package.json', 'utf8')); \
      require('fs').writeFileSync('apps/api/dist/package.json', JSON.stringify({ \
        name: 'api-runtime', version: '0.0.0', \
        dependencies: { \
          esbuild: p.devDependencies.esbuild, \
          tailwindcss: p.dependencies.tailwindcss, \
          '@tailwindcss/postcss': p.dependencies['@tailwindcss/postcss'], \
          postcss: p.dependencies.postcss, \
          playwright: p.dependencies.playwright, \
          jsdom: p.dependencies.jsdom, \
          '@anthropic-ai/claude-agent-sdk': l.dependencies['@anthropic-ai/claude-agent-sdk'] \
        } \
      })); \
    " && \
    npm install --prefix apps/api/dist --omit=dev --cache /root/.npm && \
    rm -f apps/api/dist/package.json apps/api/dist/package-lock.json

# Download Chromium browser binary for Playwright screenshot rendering.
# --with-deps installs required system libraries (libatk, libcups, etc.) in one step.
RUN cd apps/api/dist && npx playwright install --with-deps chromium

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

# The esbuild bundle is self-contained except for external packages (esbuild, tailwindcss,
# postcss, playwright) which are installed into dist/node_modules/ during the build stage.
# WASM files are copied into dist/ by the build:server script.
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Playwright Chromium browser binary + system dependencies for screenshot rendering.
# The browser was downloaded in the build stage; copy it and install OS-level libs.
COPY --from=build /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright
RUN chown -R appuser:nodejs /home/appuser/.cache/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/home/appuser/.cache/ms-playwright

# The Claude Agent SDK spawns a CLI that writes its own state under $HOME.
RUN mkdir -p /home/appuser && chown appuser:nodejs /home/appuser
ENV HOME=/home/appuser
RUN npx --prefix apps/api/dist playwright install-deps chromium

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

# API bundle (self-contained except for external packages in dist/node_modules/)
COPY --from=build /app/apps/api/dist ./apps/api/dist

# The Claude Agent SDK ships its `claude` executable as a per-platform optional
# dependency. The build stage is Debian, so npm resolved the glibc build there;
# this stage is Alpine, which needs the musl build instead. Swap them rather than
# keeping both — each binary is ~250 MB.
# Installed into a scratch prefix and moved into place: running npm directly
# against dist/ (which has no package.json) risks disturbing the packages the
# build stage already installed there.
RUN --mount=type=cache,target=/root/.npm \
    SDK_DIR=apps/api/dist/node_modules/@anthropic-ai && \
    SDK_VERSION="$(node -p "require('/app/${SDK_DIR}/claude-agent-sdk/package.json').version")" && \
    npm install --prefix /tmp/musl --no-save --cache /root/.npm \
      "@anthropic-ai/claude-agent-sdk-linux-x64-musl@${SDK_VERSION}" && \
    rm -rf "${SDK_DIR}/claude-agent-sdk-linux-x64" && \
    mv /tmp/musl/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl "${SDK_DIR}/" && \
    rm -rf /tmp/musl

# Playwright Chromium browser binary + system dependencies for screenshot rendering.
COPY --from=build /root/.cache/ms-playwright /home/node/.cache/ms-playwright
RUN chown -R node:node /home/node/.cache/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
# Alpine system libraries required by Chromium
RUN apk add --no-cache \
    chromium-swiftshader \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

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
