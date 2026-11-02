import { build } from "esbuild"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

it("starts bundled extraction admission with an asynchronous PDF dependency", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extraction-bundle-"))
  try {
    const outfile = path.join(dir, "entry.mjs")
    await build({
      stdin: { contents: `const { extractionOptionsFromConfig } = await import('./packages/pipeline/src/extraction-admission.ts'); console.log(extractionOptionsFromConfig('book.pdf', {vector_text_grouping:false}).vectorTextGrouping)`, resolveDir: process.cwd() },
      outfile, bundle: true, format: "esm", platform: "node", logLevel: "silent",
      // The actual PDF dependency initializes WASM with top-level await. Keep
      // that asynchronous module boundary without downloading fonts or opening
      // a server: an extraction/admission cycle must not deadlock startup.
      plugins: [{ name: "pdf-runtime-boundary", setup(builder) {
        builder.onResolve({ filter: /^@adt\/pdf$/ }, () => ({ path: "pdf", namespace: "fixture" }))
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `await Promise.resolve(); export const countPdfPages = () => 1; export const computeGroups = () => []; export const extractPdfStream = () => []; export const samplePageEdges = () => ({});` }))
        builder.onResolve({ filter: /^@adt\/storage$/ }, () => ({ path: createRequire(import.meta.url).resolve("@adt/storage"), external: true }))
      }}],
    })
    expect(execFileSync(process.execPath, [outfile], { encoding: "utf8", timeout: 10_000 }).trim()).toBe("false")
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
