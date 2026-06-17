import { lingui } from "@lingui/vite-plugin";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath, URL } from "node:url";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

// pdfjs-dist 5.x decodes JPEG 2000 (JPXDecode), JBIG2, and ICC color via WASM
// modules shipped in `pdfjs-dist/wasm/`. They must be reachable at a stable URL
// (with their original filenames) so pdfjs can fetch them at runtime; otherwise
// JPEG 2000 images silently fail to decode. We expose them under `/pdfjs-wasm/`
// in dev (middleware) and in builds (emitted unhashed assets).
function pdfjsWasmAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const wasmDir = join(dirname(require.resolve("pdfjs-dist/package.json")), "wasm");
  const files = readdirSync(wasmDir).filter(
    (f) => f.endsWith(".wasm") || f.endsWith(".js"),
  );
  const URL_PREFIX = "/pdfjs-wasm/";
  return {
    name: "pdfjs-wasm-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(URL_PREFIX)) return next();
        const name = url.slice(URL_PREFIX.length);
        if (!files.includes(name)) return next();
        res.setHeader(
          "Content-Type",
          name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        res.end(readFileSync(join(wasmDir, name)));
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({
          type: "asset",
          fileName: `pdfjs-wasm/${name}`,
          source: readFileSync(join(wasmDir, name)),
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDesktop = mode === "desktop";

  return {
    plugins: [
      pdfjsWasmAssets(),
      lingui(),
      tanstackRouter({
        quoteStyle: "double",
        routeFileIgnorePattern: "\\.test\\.tsx?$",
      }),
      react({
        babel: {
          plugins: ["@lingui/babel-plugin-lingui-macro"],
        },
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      open: !isDesktop,
      proxy: {
        "/api": {
          target: process.env.API_PROXY_TARGET ?? "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
  }
});
