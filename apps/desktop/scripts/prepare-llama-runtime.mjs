import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const VERSION = "b10236"
const LAYOUT_VERSION = 2
const RELEASE = `https://github.com/ggml-org/llama.cpp/releases/download/${VERSION}`
const TARGETS = {
  "darwin-arm64": ["llama-b10236-bin-macos-arm64.tar.gz", "5144584303a6bd0720c2bcd0015c12a0b9e487a51f69e5cc87a570b1261955f8"],
  "darwin-x64": ["llama-b10236-bin-macos-x64.tar.gz", "530bac97e416c997123319fbed0b7fd8eb5db6f4295102a7e5e25d6d74c95e79"],
  "win32-arm64": ["llama-b10236-bin-win-cpu-arm64.zip", "03dc9076cef9bf60520812666c8a327c8a2137bac797ce4d19f83748f125d8e0"],
  "win32-x64": ["llama-b10236-bin-win-cpu-x64.zip", "5c2c9e4ed5e1c74a60a2fab173cf1a1a20d791acba9a37084e831d703473cc93"],
  "linux-arm64": ["llama-b10236-bin-ubuntu-arm64.tar.gz", "9a6e82319c0c79bd4da34be789633b0f698d4605ea7417d1489030fba7220741"],
  "linux-x64": ["llama-b10236-bin-ubuntu-x64.tar.gz", "4bf65031e2d23a5bc524560bd40b0a3b4c27ec31eb7e5cdecc1b509ca8ec4937"],
}

function argument(name, fallback) {
  const entry = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
  return entry ? entry.slice(name.length + 3) : fallback
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256")
  hash.update(fs.readFileSync(filePath))
  return hash.digest("hex")
}

const platform = argument("platform", process.platform)
const architecture = argument("arch", process.arch)
const target = `${platform}-${architecture}`
const release = TARGETS[target]
if (!release) throw new Error(`No pinned llama.cpp runtime for ${target}`)

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(scriptDir, "..")
const outputDir = path.resolve(argument("output", path.join(desktopDir, ".runtime", "llama")))
const cacheDir = path.join(desktopDir, ".runtime", "cache")
const [archiveName, expectedSha256] = release
const archivePath = path.join(cacheDir, archiveName)
const manifestPath = path.join(outputDir, "runtime-manifest.json")

try {
  const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const server = path.join(outputDir, platform === "win32" ? "llama-server.exe" : "llama-server")
  if (current.version === VERSION && current.layoutVersion === LAYOUT_VERSION && current.target === target && fs.existsSync(server)) process.exit(0)
} catch {}

fs.mkdirSync(cacheDir, { recursive: true })
if (!fs.existsSync(archivePath) || sha256(archivePath) !== expectedSha256) {
  fs.rmSync(archivePath, { force: true })
  const response = await fetch(`${RELEASE}/${archiveName}`, { redirect: "follow" })
  if (!response.ok || !response.body) throw new Error(`Runtime download failed: HTTP ${response.status}`)
  const part = `${archivePath}.part`
  fs.rmSync(part, { force: true })
  const output = fs.createWriteStream(part, { flags: "wx" })
  for await (const chunk of response.body) {
    if (!output.write(chunk)) await new Promise((resolve) => output.once("drain", resolve))
  }
  await new Promise((resolve, reject) => output.end((error) => error ? reject(error) : resolve()))
  if (sha256(part) !== expectedSha256) {
    fs.rmSync(part, { force: true })
    throw new Error("Downloaded llama.cpp runtime failed its SHA-256 check")
  }
  fs.renameSync(part, archivePath)
}

const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adt-llama-runtime-"))
try {
  const result = spawnSync("tar", ["-xf", archivePath, "-C", extractRoot], { stdio: "inherit" })
  if (result.status !== 0) throw new Error(`Unable to extract llama.cpp runtime (tar exit ${result.status})`)
  const nested = path.join(extractRoot, VERSION.replace(/^b/, "llama-b"))
  const extracted = fs.existsSync(nested) ? nested : extractRoot
  const extractedServer = path.join(extracted, platform === "win32" ? "llama-server.exe" : "llama-server")
  if (!fs.existsSync(extractedServer)) throw new Error("llama.cpp archive layout changed")
  const staging = `${outputDir}.staging`
  fs.rmSync(staging, { recursive: true, force: true })
  fs.cpSync(extracted, staging, { recursive: true, verbatimSymlinks: true })
  for (const entry of fs.readdirSync(staging, { withFileTypes: true })) {
    if (entry.isDirectory()) continue
    const keep = entry.name === (platform === "win32" ? "llama-server.exe" : "llama-server")
      || entry.name.startsWith("LICENSE")
      || /\.(?:dll|dylib)$/.test(entry.name)
      || /\.so(?:\.|$)/.test(entry.name)
    if (!keep) fs.rmSync(path.join(staging, entry.name), { force: true })
  }
  fs.writeFileSync(path.join(staging, "runtime-manifest.json"), `${JSON.stringify({
    version: VERSION,
    layoutVersion: LAYOUT_VERSION,
    target,
    archive: archiveName,
    sha256: expectedSha256,
    source: `${RELEASE}/${archiveName}`,
  }, null, 2)}\n`)
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.renameSync(staging, outputDir)
  if (platform !== "win32") fs.chmodSync(path.join(outputDir, "llama-server"), 0o755)
} finally {
  fs.rmSync(extractRoot, { recursive: true, force: true })
}

console.log(`Prepared llama.cpp ${VERSION} for ${target}`)
