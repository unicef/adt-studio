import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

// Promise-based singleton: avoids race conditions (concurrent callers await
// the same promise) and retries on failure (promise is cleared on rejection).
let initPromise: Promise<void> | null = null;

function findWasm(): string {
  // After esbuild bundling, the WASM file sits next to the bundle.
  const bundled = join(dirname(fileURLToPath(import.meta.url)), "index_bg.wasm");
  if (existsSync(bundled)) return bundled;
  // In dev (unbundled), resolve from node_modules via require.resolve.
  const pkgMain = createRequire(import.meta.url).resolve("@resvg/resvg-wasm");
  return join(dirname(pkgMain), "index_bg.wasm");
}

function ensureWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await initWasm(readFileSync(findWasm()));
    })();
    // If init fails, clear the promise so the next call retries.
    initPromise.catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

export async function renderSvgToPng(
  svgString: string,
  options?: { zoom?: number }
): Promise<Buffer> {
  await ensureWasm();
  const zoom = options?.zoom ?? 2;
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "zoom", value: zoom },
    font: { loadSystemFonts: false },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return Buffer.from(png);
}
