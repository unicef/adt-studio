/**
 * Install packages that must stay external to the esbuild bundle (see bundle-server.mjs)
 * into apps/api/dist-electron/node_modules/. Same versions as @adt/pipeline so tooling stays aligned.
 *
 * Used by Electron (extraResources → resources/) and by the Docker image after build:server.
 * Uses npm in dist-electron/ (not pnpm) so installs are not treated as workspace packages.
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.resolve(__dirname, "..")
const monorepoRoot = path.resolve(apiRoot, "../..")
const dist = path.join(apiRoot, "dist-electron")
const pipelinePkgPath = path.join(monorepoRoot, "packages/pipeline/package.json")

const p = JSON.parse(readFileSync(pipelinePkgPath, "utf8"))
const stub = {
  name: "api-runtime",
  version: "0.0.0",
  private: true,
  dependencies: {
    esbuild: p.devDependencies.esbuild,
    tailwindcss: p.dependencies.tailwindcss,
    "@tailwindcss/postcss": p.dependencies["@tailwindcss/postcss"],
    "tw-animate-css": p.dependencies["tw-animate-css"],
    postcss: p.dependencies.postcss,
    jsdom: p.dependencies.jsdom,
  },
}

mkdirSync(dist, { recursive: true })
const pkgJsonPath = path.join(dist, "package.json")
writeFileSync(pkgJsonPath, `${JSON.stringify(stub, null, 2)}\n`)

const result = spawnSync(
  "npm",
  ["install", "--omit=dev", "--no-audit", "--no-fund"],
  {
    cwd: dist,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

unlinkSync(pkgJsonPath)
const lockPath = path.join(dist, "package-lock.json")
if (existsSync(lockPath)) {
  unlinkSync(lockPath)
}

// Remove node_modules/.bin — electron-builder's packaging walker re-creates these
// .bin symlinks at the destination and crashes with EEXIST when they already exist.
// The bundled API server doesn't shell out to any of these CLIs at runtime, so the
// .bin directory is dead weight inside the packaged app.
const binDir = path.join(dist, "node_modules", ".bin")
if (existsSync(binDir)) {
  rmSync(binDir, { recursive: true, force: true })
}

console.log("✓ api-runtime deps → dist/node_modules/")
