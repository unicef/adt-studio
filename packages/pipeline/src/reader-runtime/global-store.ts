import fs from "node:fs"
import path from "node:path"
import { ReaderSourceVersionData } from "@adt/types"
import { assertBaseVersion, type LatestReaderSource, type ReaderSourceVersion } from "./versions.js"

const VERSION_FILE = /^(\d{6})\.json$/

function fileDir(globalDir: string, sourcePath: string): string {
  return path.join(globalDir, "files", ...sourcePath.split("/"))
}

function versionNumbers(dir: string): number[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .flatMap((name) => {
      const match = VERSION_FILE.exec(name)
      return match ? [Number(match[1])] : []
    })
    .sort((a, b) => a - b)
}

function readVersion(dir: string, version: number): ReaderSourceVersion {
  const raw = fs.readFileSync(path.join(dir, `${String(version).padStart(6, "0")}.json`), "utf8")
  return { version, data: ReaderSourceVersionData.parse(JSON.parse(raw)) }
}

export function readGlobalHistory(globalDir: string, sourcePath: string): ReaderSourceVersion[] {
  const dir = fileDir(globalDir, sourcePath)
  return versionNumbers(dir).map((version) => readVersion(dir, version))
}

export function readGlobalLatest(globalDir: string, sourcePath: string): ReaderSourceVersion | null {
  const dir = fileDir(globalDir, sourcePath)
  const latest = versionNumbers(dir).at(-1)
  return latest === undefined ? null : readVersion(dir, latest)
}

export function listGlobalLatest(globalDir: string): LatestReaderSource[] {
  const root = path.join(globalDir, "files")
  if (!fs.existsSync(root)) return []
  const found: LatestReaderSource[] = []
  const visit = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const child = path.join(dir, entry.name)
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const latest = versionNumbers(child).at(-1)
      if (latest !== undefined) found.push({ path: relative, ...readVersion(child, latest) })
      visit(child, relative)
    }
  }
  visit(root, "")
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

export function writeGlobalVersion(
  globalDir: string,
  sourcePath: string,
  data: ReaderSourceVersionData,
  baseVersion: number | null,
): number {
  const dir = fileDir(globalDir, sourcePath)
  const current = versionNumbers(dir).at(-1) ?? null
  assertBaseVersion(sourcePath, current, baseVersion)
  fs.mkdirSync(dir, { recursive: true })
  const version = (current ?? 0) + 1
  try {
    fs.writeFileSync(path.join(dir, `${String(version).padStart(6, "0")}.json`), JSON.stringify(data), { flag: "wx" })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") assertBaseVersion(sourcePath, version, baseVersion)
    throw error
  }
  return version
}
