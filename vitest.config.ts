import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * Root vitest config — uses projects so each app gets its own `@` alias.
 * Without projects, `@/` would resolve to apps/studio/src for every test,
 * including adt-runtime tests whose transitive imports use a runtime-relative
 * `@/`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "studio",
          include: [
            "apps/studio/src/**/*.test.ts",
            "apps/studio/src/**/*.test.tsx",
          ],
          /**
           * Route tests import their page module inside the test body; under the
           * parallel load of the whole project that transform alone can exceed
           * the 5s default.
           */
          testTimeout: 20_000,
        },
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./apps/studio/src", import.meta.url)),
          },
        },
      },
      {
        test: {
          name: "adt-runtime",
          include: [
            "apps/adt-runtime/src/**/*.test.ts",
            "apps/adt-runtime/src/**/*.test.tsx",
          ],
        },
        resolve: {
          alias: {
            "@": fileURLToPath(
              new URL("./apps/adt-runtime/src", import.meta.url),
            ),
          },
        },
      },
      {
        test: {
          name: "api",
          include: ["apps/api/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "desktop",
          include: ["apps/desktop/src/**/*.test.ts"],
          environment: "node",
        },
        resolve: {
          alias: {
            "@root": fileURLToPath(new URL(".", import.meta.url)),
          },
        },
      },
      {
        test: {
          name: "packages",
          include: ["packages/*/src/**/__tests__/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "assets",
          include: ["assets/adt/modules/**/*.test.js"],
        },
      },
      {
        test: {
          name: "main-scripts",
          include: ["scripts/**/*.test.mjs"],
        },
      },
    ],
  },
})
