import path from "node:path"
import { HTTPException } from "hono/http-exception"
import type { Storage } from "@adt/storage"
import type { OutputKind, OutputStatus } from "@adt/types"
import { inputSignature, loadBookConfig, normalizeLocale, readOutputCatalog } from "@adt/pipeline"

/** One read model for generation, review and manual-save preconditions. */
export function catalogOutputs(storage: Storage, label: string, booksDir: string, promptsDir: string, configPath?: string, options: { timestamps?: boolean } = {}): OutputStatus[] {
  const config = loadBookConfig(label, booksDir, configPath)
  if (options.timestamps) config.speech = { ...config.speech, word_highlighting: true }
  return readOutputCatalog({ storage, config,
    bookDir: path.join(path.resolve(booksDir), label), promptsDir,
    configDir: configPath ? path.join(path.dirname(configPath), "config") : path.resolve("config"),
  })
}

export function editSourceSignature(outputs: OutputStatus[], kind: OutputKind, language?: string, pageId?: string): string {
  return inputSignature(outputs.filter((output) => output.identity.kind === kind && (!language || output.identity.language === normalizeLocale(language)) && (!pageId || output.pageIds.includes(pageId)))
    .map((output) => ({ identity: output.identity, signature: output.signature, excluded: output.excluded })))
}

export function assertEditVersion(current: number | undefined, expected: number): void {
  if ((current ?? 0) !== expected) throw new HTTPException(409, { message: "Content changed. Your draft has not been saved. Refresh before retrying." })
}
export function assertEditSource(current: string, expected: string): void {
  if (current !== expected) throw new HTTPException(409, { message: "Source or settings changed. Your draft has not been saved. Refresh before retrying." })
}
