/**
 * Compile the esbuild bundle into a standalone Node.js binary using @yao-pkg/pkg,
 * then rename to Tauri's target-triple convention and copy to desktop binaries/.
 *
 * The .wasm files in dist-pkg/ (copied there by bundle.mjs) are included as
 * pkg assets so they're embedded in the binary alongside the JS.
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

// --- Collect WASM assets from dist-pkg/ ---

const wasmFiles = fs
  .readdirSync(distDir)
  .filter((f) => f.endsWith(".wasm"))

console.log(`Target: ${pkgTarget} (${targetTriple})`)
console.log(`WASM assets (${wasmFiles.length}):`)
for (const f of wasmFiles) console.log(`  ${f}`)

// --- Write temporary package.json for pkg (configures assets) ---

const input = path.join(distDir, "api-server.mjs")
if (!fs.existsSync(input)) {
  throw new Error("dist-pkg/api-server.mjs not found — run `pnpm bundle` first")
}

const pkgJson = {
  name: "api-server",
  bin: "api-server.mjs",
  pkg: {
    assets: wasmFiles.map((f) => f),
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
