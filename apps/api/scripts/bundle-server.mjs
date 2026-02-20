/**
 * Bundle the API server into a single ESM file using esbuild for Docker/server deployment.
 *
 * Unlike bundle.mjs (which targets the pkg sidecar binary), this script produces
 * a plain Node.js-runnable ESM bundle at dist/api-server.mjs, with WASM files
 * copied alongside it so runtime loaders can find them.
 */
import { build } from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const monorepoRoot = path.resolve(root, "../..")
const outDir = path.join(root, "dist")

fs.mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [path.join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: path.join(outDir, "api-server.mjs"),
  // Packages that use __dirname-relative file lookups cannot be bundled — their
  // paths would resolve against the bundle output dir instead of the package dir.
  // These are installed into node_modules in the Docker runtime image.
  //   esbuild    — needs its native binary (handled via pre-built base.bundle.min.js)
  //   tailwindcss — reads css/preflight.css and other files from its package dir
  //   postcss    — peer/transitive dep of tailwindcss, also uses __dirname lookups
  external: ["esbuild", "tailwindcss", "postcss"],
  banner: {
    js: [
      // Polyfill __dirname, __filename, and require for ESM
      // (needed by Emscripten-generated WASM loaders that use CJS patterns)
      'import { createRequire as __polyfill_createRequire } from "node:module";',
      'import { fileURLToPath as __polyfill_fileURLToPath } from "node:url";',
      'import { dirname as __polyfill_dirname } from "node:path";',
      "var __filename = __polyfill_fileURLToPath(import.meta.url);",
      "var __dirname = __polyfill_dirname(__filename);",
      "var require = __polyfill_createRequire(import.meta.url);",
    ].join("\n"),
  },
})

// Copy .wasm files next to the bundle so runtime loaders find them.
const WASM_PACKAGES = ["node-sqlite3-wasm", "mupdf", "@resvg/resvg-wasm"]

for (const pkg of WASM_PACKAGES) {
  const pnpmDir = path.join(monorepoRoot, "node_modules/.pnpm")

  if (!fs.existsSync(pnpmDir)) {
    // Fallback: search regular node_modules (non-pnpm layout)
    const pkgPath = path.join(monorepoRoot, "node_modules", pkg)
    if (fs.existsSync(pkgPath)) {
      copyWasmFiles(pkgPath, outDir)
    }
    continue
  }

  const safeName = pkg.replace(/\//g, "+").replace(/@/g, "")
  const dirs = fs.readdirSync(pnpmDir).filter((d) => {
    const normalized = d.replace(/@/g, "").replace(/\//g, "+")
    return normalized.startsWith(safeName)
  })

  for (const dir of dirs) {
    const pkgPath = pkg.startsWith("@")
      ? path.join(pnpmDir, dir, "node_modules", ...pkg.split("/"))
      : path.join(pnpmDir, dir, "node_modules", pkg)

    if (fs.existsSync(pkgPath)) {
      copyWasmFiles(pkgPath, outDir)
    }
  }
}

function copyWasmFiles(pkgPath, outDir) {
  for (const sub of [".", "dist", "lib"]) {
    const searchDir = path.join(pkgPath, sub)
    if (!fs.existsSync(searchDir)) continue
    for (const file of fs.readdirSync(searchDir)) {
      if (file.endsWith(".wasm")) {
        fs.copyFileSync(path.join(searchDir, file), path.join(outDir, file))
        console.log(`  Copied ${file}`)
      }
    }
  }
}

// Verify all expected WASM files were copied — fail the build if any are missing
const EXPECTED_WASM = {
  "node-sqlite3-wasm": "node-sqlite3-wasm.wasm",
  "mupdf": "mupdf-wasm.wasm",
  "@resvg/resvg-wasm": "index_bg.wasm",
}

for (const [pkg, filename] of Object.entries(EXPECTED_WASM)) {
  if (!fs.existsSync(path.join(outDir, filename))) {
    throw new Error(`Missing WASM file for ${pkg}: ${filename} not found in ${outDir}`)
  }
}

console.log("✓ Bundled → dist/api-server.mjs")
