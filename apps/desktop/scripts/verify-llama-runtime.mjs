import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeDir = path.join(desktopDir, ".runtime", "llama")
const executable = path.join(runtimeDir, process.platform === "win32" ? "llama-server.exe" : "llama-server")
const manifest = JSON.parse(fs.readFileSync(path.join(runtimeDir, "runtime-manifest.json"), "utf8"))
if (!fs.existsSync(executable)) throw new Error(`Missing runtime executable: ${executable}`)

const child = spawn(executable, [
  "--model", path.join(runtimeDir, "intentional-missing-model.gguf"),
  "--no-webui",
  "--api-key", "runtime-smoke-test",
], { cwd: runtimeDir, windowsHide: true })
let output = ""
child.stdout.on("data", (data) => { output += data })
child.stderr.on("data", (data) => { output += data })
const timer = setTimeout(() => child.kill("SIGKILL"), 20_000)
const code = await new Promise((resolve) => child.once("exit", resolve))
clearTimeout(timer)

if (code === 0 || !/failed to (?:open GGUF|load model)|model loading error/i.test(output)) {
  throw new Error(`llama.cpp runtime smoke failed (exit ${code}):\n${output.slice(-4000)}`)
}
console.log(`Verified llama.cpp ${manifest.version} native runtime for ${manifest.target}`)
