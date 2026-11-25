import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { ReaderSourcePath } from "@adt/types"

export function readerRuntimeDir(webAssetsDir: string): string | null {
  const candidates = [path.resolve(webAssetsDir, "../adt-runtime"), path.resolve(webAssetsDir, "../../apps/adt-runtime")]
  return candidates.find((dir) => fs.existsSync(path.join(dir, "build-options.mjs")) && fs.existsSync(path.join(dir, "src"))) ?? null
}

export function globalReaderSourceDir(booksDir: string): string {
  return path.join(path.resolve(booksDir), ".reader-source")
}

export function hashSource(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

function walk(dir: string, prefix = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return walk(path.join(dir, entry.name), relative)
    return entry.isFile() ? [relative] : []
  })
}

export function listBaseSourceFiles(runtimeDir: string): string[] {
  return walk(path.join(runtimeDir, "src"))
    .filter((file) => ReaderSourcePath.safeParse(file).success)
    .sort()
}

export function readBaseSource(runtimeDir: string, sourcePath: string): string | null {
  const file = path.join(runtimeDir, "src", ...sourcePath.split("/"))
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file, "utf8") : null
}

export function baseSourceHash(runtimeDir: string, sourcePath: string): string | null {
  const content = readBaseSource(runtimeDir, sourcePath)
  return content === null ? null : hashSource(content)
}

export function runtimeSourceFingerprint(runtimeDir: string): string {
  const files = ["package.json", "build-options.mjs", ...walk(path.join(runtimeDir, "src")).map((file) => `src/${file}`)]
  const entries = files.map((file) => {
    const stat = fs.statSync(path.join(runtimeDir, file))
    return [file, stat.size, stat.mtimeMs]
  })
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex")
}

export function readerAllowedPackages(runtimeDir: string): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(runtimeDir, "package.json"), "utf8")) as { dependencies?: Record<string, string> }
  return [...Object.keys(manifest.dependencies ?? {}), "@adt/types"]
}
