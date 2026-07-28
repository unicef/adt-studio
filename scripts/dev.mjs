import { spawn, execFileSync } from "node:child_process"
import { findFreePort } from "./find-free-port.mjs"

function humanize(slug) {
  const spaced = slug.replace(/[-_]+/g, " ").trim()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : ""
}

function detectWorkspaceLabel() {
  if (process.env.CONDUCTOR_WORKSPACE_NAME) {
    return humanize(process.env.CONDUCTOR_WORKSPACE_NAME)
  }
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    if (!branch || branch === "HEAD") return ""
    const name = branch.includes("/") ? branch.slice(branch.lastIndexOf("/") + 1) : branch
    return humanize(name)
  } catch {
    return ""
  }
}

const apiPort = await findFreePort({ start: 3001 })
if (!apiPort) {
  console.error("[dev] could not find a free port for the API in 3001-49151")
  process.exit(1)
}

const proxyTarget = `http://localhost:${apiPort}`
console.log(`[dev] API port: ${apiPort}`)
console.log(`[dev] Studio proxy target: ${proxyTarget}`)

const extraEnv = {
  PORT: String(apiPort),
  API_PROXY_TARGET: proxyTarget,
}

const workspaceLabel = detectWorkspaceLabel()
if (workspaceLabel) {
  extraEnv.VITE_WORKSPACE_NAME = workspaceLabel
  console.log(`[dev] Workspace: ${workspaceLabel}`)
}

const env = {
  ...process.env,
  ...extraEnv,
}

const children = [
  spawn("pnpm", ["tsc", "--build", "--watch", "--preserveWatchOutput"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  }),
  spawn("pnpm", ["--filter", "@adt/runtime", "build:watch"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  }),
  spawn("pnpm", ["--filter", "@adt/api", "dev"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  }),
  spawn("pnpm", ["--filter", "@adt/studio", "dev"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  }),
]

const forward = (signal) => () => {
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
}
process.on("SIGINT", forward("SIGINT"))
process.on("SIGTERM", forward("SIGTERM"))

let exiting = false
for (const child of children) {
  child.on("exit", (code, signal) => {
    if (exiting) return
    exiting = true
    for (const other of children) {
      if (other !== child && !other.killed) other.kill("SIGTERM")
    }
    if (signal) process.kill(process.pid, signal)
    else process.exit(code ?? 0)
  })
}
