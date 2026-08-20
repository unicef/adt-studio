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
import { createRequire } from "node:module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const monorepoRoot = path.resolve(root, "../..")
const outDir = path.join(root, "dist")
const require = createRequire(import.meta.url)

fs.mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [path.join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: path.join(outDir, "api-server.mjs"),
  // These packages cannot be bundled — they locate assets (native binaries, CSS files)
  // via paths relative to their own package directory, which breaks when inlined.
  // Playwright also requires chromium-bidi (a native dep) that can't be resolved at
  // bundle time. All four are installed into dist/node_modules/ by the Dockerfile
  // build stage. npm handles esbuild's platform binary (@esbuild/linux-x64)
  // as an optional dependency automatically.
  external: [
    "esbuild",
    "tailwindcss",
    "@tailwindcss/postcss",
    "@tailwindcss/node",
    "@tailwindcss/oxide",
    "lightningcss",
    "postcss",
    "playwright",
    "playwright-core",
    "jsdom",
    "onnxruntime-node",
  ],
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

// Keep ONNX external and copy only the build platform's native binding. This
// works for both local server builds and Linux Docker builds without bundling
// model weights or unused platform binaries.
const resolveFromLlm = { paths: [path.join(monorepoRoot, "packages", "llm")] }
const ortPackageDir = path.dirname(require.resolve("onnxruntime-node/package.json", resolveFromLlm))
const ortCommonDir = path.resolve(
  path.dirname(require.resolve("onnxruntime-common", { paths: [ortPackageDir] })),
  "../..",
)
const modulesDir = path.join(outDir, "node_modules")
const ortTargetDir = path.join(modulesDir, "onnxruntime-node")
const ortCommonTargetDir = path.join(modulesDir, "onnxruntime-common")
fs.rmSync(ortTargetDir, { recursive: true, force: true })
fs.rmSync(ortCommonTargetDir, { recursive: true, force: true })
fs.mkdirSync(ortTargetDir, { recursive: true })
fs.copyFileSync(path.join(ortPackageDir, "package.json"), path.join(ortTargetDir, "package.json"))
fs.cpSync(path.join(ortPackageDir, "dist"), path.join(ortTargetDir, "dist"), { recursive: true })
fs.cpSync(
  path.join(ortPackageDir, "bin", "napi-v3", process.platform, process.arch),
  path.join(ortTargetDir, "bin", "napi-v3", process.platform, process.arch),
  { recursive: true },
)
fs.cpSync(ortCommonDir, ortCommonTargetDir, { recursive: true })
console.log(`  Copied onnxruntime-node for ${process.platform}/${process.arch}`)

for (const [pkg, filename] of Object.entries(EXPECTED_WASM)) {
  if (!fs.existsSync(path.join(outDir, filename))) {
    throw new Error(`Missing WASM file for ${pkg}: ${filename} not found in ${outDir}`)
  }
}

console.log("✓ Bundled → dist/api-server.mjs")
