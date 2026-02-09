import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const esmRequire = createRequire(import.meta.url);

const RESVG_PKG = "@resvg/resvg-wasm";

interface ResvgRendered {
  asPng(): Uint8Array;
  free(): void;
}

interface ResvgInstance {
  render(): ResvgRendered;
  free(): void;
}

interface ResvgModule {
  initWasm: (data: ArrayBufferView | ArrayBuffer) => Promise<void>;
  Resvg: new (svg: string, options?: Record<string, unknown>) => ResvgInstance;
}

// Promise-based singleton: avoids race conditions (concurrent callers await
// the same promise) and retries on failure (promise is cleared on rejection).
let initPromise: Promise<ResvgModule> | null = null;

function ensureWasm(): Promise<ResvgModule> {
  if (!initPromise) {
    initPromise = (async () => {
      const mod = esmRequire(RESVG_PKG) as ResvgModule;
      const pkgMain = esmRequire.resolve(RESVG_PKG);
      const wasmPath = join(dirname(pkgMain), "index_bg.wasm");
      await mod.initWasm(readFileSync(wasmPath));
      return mod;
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
  const mod = await ensureWasm();
  const zoom = options?.zoom ?? 2;
  const resvg = new mod.Resvg(svgString, {
    fitTo: { mode: "zoom", value: zoom },
    font: { loadSystemFonts: false },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return Buffer.from(png);
}
