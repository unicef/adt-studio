import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { PromptName, PromptSelection, PromptVersion } from "@adt/types"

export class PromptFileError extends Error {
  constructor(public readonly code: string, message: string) { super(message) }
}

/** Resolve existing ancestors too, so a missing leaf beneath an alias is safe. */
export function physicalPromptRoot(root: string): string {
  const resolved = path.resolve(root)
  if (fs.existsSync(resolved)) return fs.realpathSync(resolved)
  const parent = path.dirname(resolved)
  return path.join(physicalPromptRoot(parent), path.basename(resolved))
}

export function assertWritablePromptRoot(bundled: string, writable: string, sourceLabel = "bundled resources"): void {
  const source = physicalPromptRoot(bundled)
  const target = physicalPromptRoot(writable)
  if (source === target || source.startsWith(target + path.sep) || target.startsWith(source + path.sep)) {
    throw new PromptFileError("PROMPT_INVALID_ROOT", `Writable prompt overrides must be separate from ${sourceLabel}`)
  }
}

/** Reject symlink escapes as well as lexical traversal, including missing leaves. */
export function promptPath(root: string, ...parts: string[]): string {
  const base = path.resolve(root)
  const result = path.resolve(base, ...parts)
  if (result !== base && !result.startsWith(base + path.sep)) {
    throw new PromptFileError("PROMPT_INVALID_PATH", "Prompt path escapes its owning root")
  }
  let cursor = base
  for (const part of path.relative(base, result).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part)
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) {
        throw new PromptFileError("PROMPT_INVALID_PATH", "Prompt paths must not contain symbolic links")
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  // Roots supplied by deployment adapters may be symlinks, but children may not.
  return result
}

export function promptVersionDir(root: string, name: string): string {
  return promptPath(root, ".versions", PromptName.parse(name))
}

export function readPromptSelection(root: string, name: string): PromptSelection | null {
  const dir = promptVersionDir(root, name)
  const pointer = promptPath(root, ".versions", name, ".current")
  if (!fs.existsSync(pointer)) {
    if (fs.existsSync(path.join(dir, ".selections"))) {
      throw new PromptFileError("PROMPT_SELECTION_INVALID", "Prompt selection is missing; restore a retained selection before editing")
    }
    return null
  }
  const raw = fs.readFileSync(pointer, "utf8").trim()
  // Legacy pointers are migration inputs, never interpreted as malformed JSON.
  if (!raw.startsWith("{")) {
    if (raw !== "fallback" && raw !== "default" && !PromptVersion.safeParse(raw).success) {
      throw new PromptFileError("PROMPT_SELECTION_INVALID", "Invalid legacy prompt selection")
    }
    if (raw.endsWith(".liquid") && !fs.existsSync(promptPath(root, ".versions", name, raw))) {
      throw new PromptFileError("PROMPT_SELECTION_INVALID", "Selected prompt version is missing")
    }
    return null
  }
  let selection: PromptSelection
  try { selection = PromptSelection.parse(JSON.parse(raw)) } catch {
    throw new PromptFileError("PROMPT_SELECTION_INVALID", "Prompt selection is corrupt; restore a retained selection before editing")
  }
  if (selection.kind === "version" && !fs.existsSync(promptPath(root, ".versions", name, selection.version!))) {
    throw new PromptFileError("PROMPT_SELECTION_INVALID", "Selected prompt version is missing")
  }
  return selection
}

/** Compatibility discovery is used only for legacy directories without selection records. */
export function legacyPromptSelection(root: string, name: string): string | null {
  const dir = promptVersionDir(root, name)
  if (!fs.existsSync(dir)) return null
  if (fs.existsSync(path.join(dir, ".selections"))) {
    throw new PromptFileError("PROMPT_SELECTION_INVALID", "New-format prompt selection is missing")
  }
  const pointer = promptPath(root, ".versions", name, ".current")
  if (fs.existsSync(pointer)) {
    const value = fs.readFileSync(pointer, "utf8").trim()
    if (value === "fallback" || value === "default") return value
    if (!PromptVersion.safeParse(value).success || !fs.existsSync(promptPath(root, ".versions", name, value))) {
      throw new PromptFileError("PROMPT_SELECTION_INVALID", "Invalid legacy prompt selection")
    }
    return value
  }
  return listPromptVersionFiles(root, name).at(-1) ?? null
}

export function listPromptVersionFiles(root: string, name: string): string[] {
  const dir = promptVersionDir(root, name)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((file) => PromptVersion.safeParse(file).success).sort()
}

function syncDirectory(dir: string) {
  // Windows does not support opening directories for fsync. File fsync and
  // same-directory atomic rename still apply there.
  if (process.platform === "win32") return
  const fd = fs.openSync(dir, "r")
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

export function writePromptFileExclusive(file: string, content: string) {
  const fd = fs.openSync(file, "wx", 0o600)
  try { fs.writeFileSync(fd, content, "utf8"); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  syncDirectory(path.dirname(file))
}

export function writePromptFileAtomic(file: string, content: string) {
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    writePromptFileExclusive(temp, content)
    fs.renameSync(temp, file)
    syncDirectory(path.dirname(file))
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
  }
}

/** Caller holds the root writer gate. History records are never replaced. */
export function publishPromptSelection(root: string, name: string, selection: PromptSelection) {
  const dir = promptVersionDir(root, name)
  fs.mkdirSync(dir, { recursive: true })
  const history = promptPath(root, ".versions", name, ".selections")
  fs.mkdirSync(history, { recursive: true })
  const bytes = JSON.stringify(PromptSelection.parse(selection)) + "\n"
  writePromptFileExclusive(promptPath(root, ".versions", name, ".selections", `${selection.id}.json`), bytes)
  writePromptFileAtomic(promptPath(root, ".versions", name, ".current"), bytes)
}

export function initializePromptSelection(root: string, name: string, modelId: string | null): PromptSelection {
  const current = readPromptSelection(root, name)
  if (current) {
    if (current.modelId != null && current.modelId !== modelId) {
      throw new PromptFileError("PROMPT_MODEL_CONFLICT", "Model id collides with an existing prompt candidate")
    }
    return current
  }
  const legacy = legacyPromptSelection(root, name)
  const initial: PromptSelection = {
    format: 1, id: randomUUID(), previous: null, modelId,
    kind: legacy === "fallback" || legacy === "default" ? legacy : legacy ? "version" : "flat",
    ...(legacy?.endsWith(".liquid") ? { version: legacy } : {}),
  }
  const dir = promptVersionDir(root, name)
  fs.mkdirSync(dir, { recursive: true })
  const bytes = JSON.stringify(initial) + "\n"
  // No new version exists yet. If this first rename fails, the old legacy/flat
  // resolution remains valid; do not create a format marker before it.
  writePromptFileAtomic(promptPath(root, ".versions", name, ".current"), bytes)
  fs.mkdirSync(promptPath(root, ".versions", name, ".selections"), { recursive: true })
  writePromptFileExclusive(promptPath(root, ".versions", name, ".selections", `${initial.id}.json`), bytes)
  return initial
}

export function savePromptVersion(root: string, name: string, content: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "")
  for (let sequence = 0; sequence < 1000; sequence++) {
    const version = `${timestamp}-${String(sequence).padStart(3, "0")}.liquid`
    const file = promptPath(root, ".versions", name, version)
    if (fs.existsSync(file)) continue
    writePromptFileExclusive(file, content)
    return version
  }
  throw new PromptFileError("PROMPT_STORAGE_ERROR", "Unable to allocate a prompt version")
}

/** A crashed/unknown owner is never guessed away: operators can recover its lock
 * after stopping all writers. No time-based lease can let a paused writer overlap. */
export function acquirePromptGate(root: string): () => void {
  fs.mkdirSync(root, { recursive: true })
  const lock = promptPath(root, ".prompt-write.lock")
  try { fs.mkdirSync(lock) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PromptFileError("PROMPT_BUSY", "Prompt storage is busy; retry, or recover the writer lock after stopping all writers")
    }
    throw error
  }
  try { writePromptFileExclusive(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid })) }
  catch (error) { fs.rmSync(lock, { recursive: true }); throw error }
  return () => fs.rmSync(lock, { recursive: true })
}

export async function withPromptGates<T>(roots: string[], operation: () => T): Promise<T> {
  const ordered = [...new Set(roots.map(physicalPromptRoot))].sort()
  for (let attempt = 0; ; attempt++) {
    const releases: Array<() => void> = []
    try {
      for (const root of ordered) releases.push(acquirePromptGate(root))
      return operation()
    } catch (error) {
      if (!(error instanceof PromptFileError) || error.code !== "PROMPT_BUSY" || attempt >= 200) throw error
    } finally { releases.reverse().forEach((release) => release()) }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

export function promptDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
