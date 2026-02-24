/**
 * Compile the esbuild bundle into a standalone Node.js binary using @yao-pkg/pkg,
 * then rename to Tauri's target-triple convention and copy to desktop binaries/.
 *
 * All non-JS files in dist-pkg/ (wasm, css, etc.) are included as pkg assets
 * so they're embedded in the binary and accessible via fs.readFileSync at runtime.
 * esbuild may emit CSS files (e.g. css/preflight.css) when bundling packages like
 * tailwindcss — these must be assets or pkg will throw at runtime.
 */
import { exec as execPkg } from "@yao-pkg/pkg"
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const distDir = path.join(root, "dist-pkg")
const desktopBinDir = path.resolve(root, "../desktop/src-tauri/binaries")

// --- Detect host platform ---

const rustcOut = execSync("rustc -vV", { encoding: "utf-8" })
const hostLine = rustcOut.match(/^host:\s*(.+)$/m)
if (!hostLine) throw new Error("Could not detect Rust host target triple")
const targetTriple = hostLine[1].trim()

const isWindows = targetTriple.includes("windows")
const binaryName = `api-server-${targetTriple}${isWindows ? ".exe" : ""}`

// Map Rust target triple → pkg target string
function rustTripleToPkgTarget(triple) {
  let arch = "x64"
  if (triple.includes("aarch64")) arch = "arm64"

  let os = "linux"
  if (triple.includes("apple") || triple.includes("darwin")) os = "macos"
  else if (triple.includes("windows")) os = "win"

  return `node20-${os}-${arch}`
}

const pkgTarget = rustTripleToPkgTarget(targetTriple)

// --- Collect ALL non-JS asset files from dist-pkg/ (wasm, css, etc.) ---
// esbuild may emit CSS files (e.g. css/preflight.css) alongside the bundle when
// packages like tailwindcss are bundled. All such files must be included as pkg
// assets so they're embedded in the snapshot and readable at runtime.

function collectAssets(dir, baseDir, assets = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const relPath = path.relative(baseDir, fullPath)
    if (entry.isDirectory()) {
      collectAssets(fullPath, baseDir, assets)
    } else if (!entry.name.endsWith(".mjs") && entry.name !== "package.json") {
      assets.push(relPath)
    }
  }
  return assets
}

const allAssets = collectAssets(distDir, distDir)

console.log(`Target: ${pkgTarget} (${targetTriple})`)
console.log(`Assets (${allAssets.length}):`)
for (const f of allAssets) console.log(`  ${f}`)

// --- Write temporary package.json for pkg (configures assets) ---

const input = path.join(distDir, "api-server.mjs")
if (!fs.existsSync(input)) {
  throw new Error("dist-pkg/api-server.mjs not found — run `pnpm bundle` first")
}

const pkgJson = {
  name: "api-server",
  bin: "api-server.mjs",
  pkg: {
    assets: allAssets,
  },
}

const pkgJsonPath = path.join(distDir, "package.json")
fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2))

// --- Run pkg ---

const pkgOutput = path.join(distDir, "api-server")

await execPkg([
  pkgJsonPath,
  "--target", pkgTarget,
  "--output", pkgOutput,
  "--compress", "GZip",
])

// Clean up temp package.json
fs.unlinkSync(pkgJsonPath)

// pkg outputs "api-server" (no suffix for single target)
const outputFile = pkgOutput + (isWindows ? ".exe" : "")
if (!fs.existsSync(outputFile)) {
  throw new Error(`Expected pkg output not found: ${outputFile}`)
}

// --- Copy to Tauri binaries ---

fs.mkdirSync(desktopBinDir, { recursive: true })
const dest = path.join(desktopBinDir, binaryName)
fs.copyFileSync(outputFile, dest)
fs.chmodSync(dest, 0o755)

console.log(`✓ Binary → ${dest}`)
