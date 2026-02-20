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

# Copy read-only code assets (prompts, templates, global config, web runner)
COPY prompts/ ./prompts/
COPY templates/ ./templates/
COPY config.yaml ./config.yaml
COPY assets/ ./assets/

# Pre-build the ADT web runner JS bundle so esbuild is not needed at runtime.
# buildJsBundle() in @adt/pipeline will copy this file instead of invoking esbuild.
# Must run from packages/pipeline/ so pnpm resolves esbuild (it's a devDep there).
RUN cd packages/pipeline && node --input-type=module --eval \
  "import { build } from 'esbuild'; \
   await build({ \
     entryPoints: ['/app/assets/adt/base.js'], \
     bundle: true, minify: true, sourcemap: true, \
     format: 'esm', target: 'es2020', \
     outfile: '/app/assets/adt/base.bundle.min.js' \
   }); \
   console.log('Pre-built assets/adt/base.bundle.min.js');"

# Build all TypeScript packages (tsc --build — type-checks + compiles shared packages)
RUN pnpm build

# Bundle the API with esbuild (produces dist/api-server.mjs with correct ESM imports)
RUN pnpm --filter @adt/api build:server

# Build the studio SPA (Vite)
RUN pnpm --filter @adt/studio build

# Generate package.json for the runtime-deps stage.
# Run from packages/pipeline/ where tailwindcss/postcss are direct deps so
# pnpm can resolve them. Docker COPY can't follow pnpm symlinks across stages,
# so we produce a plain JSON file with pinned versions instead.
RUN cd packages/pipeline && node -e " \
  const fs = require('fs'); \
  const ver = (pkg) => JSON.parse(fs.readFileSync(require.resolve(pkg + '/package.json'), 'utf8')).version; \
  fs.writeFileSync('/app/runtime-deps-package.json', JSON.stringify({ \
    name: 'runtime-deps', private: true, \
    dependencies: { tailwindcss: ver('tailwindcss'), postcss: ver('postcss') } \
  }));"

# =============================================================================
# Stage 3.5: Runtime deps — packages that cannot be bundled.
# They use __dirname-relative file lookups so they must live in node_modules.
# Add new unbundleable packages here; runtime-assets picks them up automatically.
# =============================================================================
FROM base AS runtime-deps

WORKDIR /install

# package.json was generated by the build stage with exact pinned versions.
COPY --from=build /app/runtime-deps-package.json ./package.json

# --shamefully-hoist produces a flat node_modules (no pnpm symlinks) so the
# directory can be copied cleanly into the scratch runtime-assets stage.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --no-lockfile --shamefully-hoist

# =============================================================================
# Stage 3.6: Runtime assets — all baked-in server defaults in one place.
# Add new runtime asset directories here; Stage 4/6 pick them up automatically.
# =============================================================================
FROM scratch AS runtime-assets
COPY --from=build /app/prompts/ /prompts/
COPY --from=build /app/templates/ /templates/
COPY --from=build /app/assets/adt/ /assets/adt/
COPY --from=build /app/config.yaml /config.yaml
# Packages that can't be bundled — installed into /app/node_modules at runtime
COPY --from=runtime-deps /install/node_modules /node_modules/

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
COPY --from=runtime-assets / ./

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
COPY --from=runtime-assets / ./

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
