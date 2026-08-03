import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(scriptDir, "..")
const outputDir = path.join(desktopDir, ".runtime", "kokoro")
const target = `${process.platform}-${process.arch}`

fs.mkdirSync(outputDir, { recursive: true })
for (const name of fs.readdirSync(outputDir)) {
  fs.rmSync(path.join(outputDir, name), { recursive: true, force: true })
}
if (target !== "darwin-arm64") {
  fs.writeFileSync(path.join(outputDir, "runtime-manifest.json"), `${JSON.stringify({ version: 1, target, available: false }, null, 2)}\n`)
  console.log(`Kokoro MLX runtime is not available for ${target}; ONNX remains enabled`)
  process.exit(0)
}

const packageDir = path.join(desktopDir, "native", "kokoro-runtime")
const result = spawnSync("swift", ["build", "-c", "release", "--package-path", packageDir], {
  stdio: "inherit",
})
if (result.status !== 0) throw new Error(`Kokoro runtime build failed (exit ${result.status})`)

const buildDir = path.join(packageDir, ".build", "arm64-apple-macosx", "release")
const source = path.join(buildDir, "adt-kokoro-runtime")
if (!fs.existsSync(source)) throw new Error("Kokoro runtime build did not produce adt-kokoro-runtime")
const destination = path.join(outputDir, "adt-kokoro-runtime")
fs.copyFileSync(source, destination)
fs.chmodSync(destination, 0o755)
fs.writeFileSync(path.join(outputDir, "runtime-manifest.json"), `${JSON.stringify({
  version: 1,
  target,
  available: true,
  upstream: "mweinbach/kokoro-runtime-swift@2c876fcd54b36b6a18895b18d756fe6b7feb96f8",
}, null, 2)}\n`)
console.log(`Prepared Kokoro MLX runtime for ${target}`)
