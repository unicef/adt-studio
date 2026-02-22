/**
 * Bundle the API server into a single ESM file using esbuild.
 *
 * All JS code (including WASM-loader modules) is bundled. The .wasm binary
 * files are copied next to the output so that runtime fs.readFileSync()
 * and import.meta.url-based resolution finds them.
 *
 * An esbuild plugin rewrites `await import("...")` dynamic imports in mupdf
 * to synchronous `require("...")` calls. This is required because pkg (the
 * standalone-binary compiler) doesn't support dynamic import() in its runtime.
 */
import { build } from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const monorepoRoot = path.resolve(root, "../..")
const outDir = path.join(root, "dist-pkg")

/**
 * esbuild plugin: replace `await import("node:fs")` and `await import("module")`
 * with synchronous require() calls in mupdf source files. This eliminates
 * dynamic ESM imports that pkg's Node.js snapshot runtime can't handle.
 */
const replaceDynamicImports = {
  name: "replace-dynamic-imports",
  setup(build) {
    build.onLoad({ filter: /mupdf.*\.(js|mjs)$/ }, async (args) => {
      let source = await fs.promises.readFile(args.path, "utf-8")
      let modified = false

      // Replace await import("node:fs") → require("node:fs")
      if (source.includes('await import("node:fs")')) {
        source = source.replace(
          /await import\("node:fs"\)/g,
          'require("node:fs")'
        )
        modified = true
      }

      // Replace await import("module") → require("node:module")
      if (source.includes('await import("module")')) {
        source = source.replace(
          /await import\("module"\)/g,
          'require("node:module")'
        )
        modified = true
      }

      if (!modified) return undefined // let esbuild handle it normally

      return {
        contents: source,
        loader: "js",
      }
    })
  },
}

await build({
  entryPoints: [path.join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: path.join(outDir, "api-server.mjs"),
  plugins: [replaceDynamicImports],
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
// Search the pnpm store since these packages are transitive deps.
const WASM_PACKAGES = ["node-sqlite3-wasm", "mupdf", "@resvg/resvg-wasm"]

fs.mkdirSync(outDir, { recursive: true })

for (const pkg of WASM_PACKAGES) {
  const pnpmDir = path.join(monorepoRoot, "node_modules/.pnpm")
  const safeName = pkg.replace(/\//g, "+").replace(/@/g, "")
  const dirs = fs.readdirSync(pnpmDir).filter((d) => {
    const normalized = d.replace(/@/g, "").replace(/\//g, "+")
    return normalized.startsWith(safeName)
  })

  for (const dir of dirs) {
    const pkgPath = pkg.startsWith("@")
      ? path.join(pnpmDir, dir, "node_modules", ...pkg.split("/"))
      : path.join(pnpmDir, dir, "node_modules", pkg)

    if (!fs.existsSync(pkgPath)) continue

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

console.log("✓ Bundled → dist-pkg/api-server.mjs")
