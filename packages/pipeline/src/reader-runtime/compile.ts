import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { ReaderSourceCompileError } from "@adt/types"
import { runtimeSourceFingerprint } from "./base-source.js"
import type { ReaderOverlayFile } from "./overlay.js"

export const COMPILED_READER_FILES = ["base.bundle.min.js", "base.bundle.min.js.map", "base.bundle.local.js"] as const

export type CompileReaderRuntimeResult =
  | { ok: true; hash: string; dir: string; cached: boolean; errors: [] }
  | { ok: false; hash: string; errors: ReaderSourceCompileError[] }

interface RuntimeBuildModule {
  buildReaderRuntime(options: { overlay: Map<string, string>; outDir: string }): Promise<{ ok: boolean; errors: ReaderSourceCompileError[] }>
}

export interface CompileReaderRuntimeOptions {
  runtimeDir: string
  files: ReadonlyArray<Pick<ReaderOverlayFile, "path" | "content">>
  cacheDir: string
}

export async function compileReaderRuntime(options: CompileReaderRuntimeOptions): Promise<CompileReaderRuntimeResult> {
  const entries = [...options.files].sort((a, b) => a.path.localeCompare(b.path)).map((file) => [file.path, file.content] as const)
  const hash = createHash("sha256")
    .update(JSON.stringify([runtimeSourceFingerprint(options.runtimeDir), entries]))
    .digest("hex")
  const dir = path.join(options.cacheDir, "reader-runtime", hash)
  if (COMPILED_READER_FILES.every((file) => fs.existsSync(path.join(dir, file)))) {
    return { ok: true, hash, dir, cached: true, errors: [] }
  }

  const buildModule = pathToFileURL(path.join(options.runtimeDir, "build-options.mjs")).href
  const { buildReaderRuntime } = (await import(buildModule)) as RuntimeBuildModule
  const staging = `${dir}.${randomUUID()}.tmp`
  fs.mkdirSync(staging, { recursive: true })
  try {
    const result = await buildReaderRuntime({ overlay: new Map(entries), outDir: staging })
    if (!result.ok) return { ok: false, hash, errors: result.errors }
    try {
      fs.renameSync(staging, dir)
    } catch (error) {
      if (!fs.existsSync(dir)) throw error
    }
    return { ok: true, hash, dir, cached: false, errors: [] }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}
