import { build } from 'esbuild';
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const monorepoRoot = path.resolve(root, "../..")
const outDir = path.join(root, "dist-electron")
const require = createRequire(import.meta.url)

await build({
    entryPoints: [path.join(root, "src/index.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: path.join(outDir, "api-server.mjs"),
    external: [
        "playwright",
        "playwright-core",
        "jsdom",
        "esbuild",
        "tailwindcss",
        "@tailwindcss/postcss",
        "@tailwindcss/node",
        "@tailwindcss/oxide",
        "lightningcss",
        "postcss",
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
  // Search the pnpm store since these packages are transitive deps.
  const WASM_PACKAGES = ["node-sqlite3-wasm", "mupdf", "@resvg/resvg-wasm"]
  
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

  // Keep the native ONNX binding external to the esbuild bundle. Copy only
  // the current platform/architecture so desktop builds do not carry every
  // macOS, Windows, and Linux binary shipped by onnxruntime-node.
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
  
  console.log("✓ Bundled → dist-electron/api-server.mjs")
