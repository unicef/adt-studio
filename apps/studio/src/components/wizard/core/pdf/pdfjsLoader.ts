import { isElectron } from "@/lib/utils"
import { installCollectionMethodPolyfills } from "@/lib/pdfjs-dist-polyfill"

let pdfjsModule: Promise<typeof import("pdfjs-dist")> | null = null

// pdfjs-dist 5.x loads its JPEG 2000 (OpenJPEG) and JBIG2 WASM decoders from
// this directory at runtime. Without it, JPEG 2000 cover images fail to decode
// and silently render blank. The files are served here by the `pdfjsWasmAssets`
// Vite plugin (trailing slash is required by pdfjs).
const PDF_WASM_BASE_URL = `${import.meta.env.BASE_URL}pdfjs-wasm/`

/** WASM-decoder URL to spread into every `getDocument` call that renders pages. */
export const PDF_WASM_OPTIONS = {
  wasmUrl: PDF_WASM_BASE_URL,
} as const

/** Single dynamic import + worker setup so pdf work stays off the critical path until needed. */
export function getPdfJs() {
  if (!pdfjsModule) {

    if (isElectron()) {
      installCollectionMethodPolyfills()
    }

    pdfjsModule = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).href
      return pdfjs
    })

  }
  
  return pdfjsModule
}
