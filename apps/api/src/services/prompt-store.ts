import fs from "node:fs"
import { randomUUID } from "node:crypto"
import type { PromptResponse, PromptVersionsResponse } from "@adt/types"
import {
  initializePromptSelection, legacyPromptSelection, listPromptVersionFiles,
  promptDigest, promptModelFolderName, promptPath, publishPromptSelection,
  readPromptSelection, resolvePromptFile, savePromptVersion, PromptFileError,
} from "@adt/llm"

export function readPromptState(roots: string[], name: string, modelId: string | null, book: boolean): PromptResponse | null {
  const resolved = resolvePromptFile(roots, name, modelId)
  if (!resolved) return null
  const source = resolved.root === roots.at(-1) ? "bundled" : book && resolved.root === roots[0] ? "book" : "global"
  const candidate = modelId ? `${name}__${promptModelFolderName(modelId)}` : name
  return {
    name, resolvedName: resolved.resolvedName, content: resolved.content,
    source, modelId: resolved.resolvedName === name ? null : modelId, requestedModelId: modelId, version: resolved.version,
    revision: promptDigest([name, modelId, resolved.resolvedName, source, resolved.content, resolved.selectionState]),
    persistence: { source, saveTarget: book ? "book" : "global", logicalPath: `${book ? "prompts/" : ""}.versions/${candidate}` },
  }
}

export function promptHistory(roots: string[], name: string, modelId: string | null): PromptVersionsResponse {
  const root = roots[0]
  const candidate = modelId ? `${name}__${promptModelFolderName(modelId)}` : name
  const selection = readPromptSelection(root, candidate)
  const legacy = selection ? null : legacyPromptSelection(root, candidate)
  const version = selection?.version ?? (legacy?.endsWith(".liquid") ? legacy : null)
  const fallback = resolvePromptFile(roots.slice(1), name, modelId)
  return {
    name, resolvedName: candidate, modelId,
    fallbackContent: fallback?.content ?? null, fallbackResolvedName: fallback?.resolvedName ?? null,
    currentVersion: version ?? null,
    isFallbackCurrent: selection?.kind === "fallback" || selection?.kind === "default",
    versions: listPromptVersionFiles(root, candidate).reverse().map((file) => ({
      version: file, createdAt: promptVersionDate(file),
      content: fs.readFileSync(promptPath(root, ".versions", candidate, file), "utf8"), isCurrent: version === file,
    })),
  }
}

/** Called only while all writable roots are locked and the revision is current. */
export function mutatePromptSelection(
  roots: string[], name: string, modelId: string | null, book: boolean,
  operation: { kind: "save"; content: string } | { kind: "reset" } | { kind: "restore"; version: string },
): PromptResponse {
  const root = roots[0]
  const candidate = modelId ? `${name}__${promptModelFolderName(modelId)}` : name
  const current = readPromptState(roots, name, modelId, book)
  if (!current) throw new PromptFileError("PROMPT_NOT_FOUND", "Prompt not found")
  if (operation.kind === "save" && operation.content === current.content) return current
  if (operation.kind === "restore" && !fs.existsSync(promptPath(root, ".versions", candidate, operation.version))) {
    throw new PromptFileError("PROMPT_NOT_FOUND", "Prompt version not found")
  }
  const previous = initializePromptSelection(root, candidate, modelId)
  const version = operation.kind === "save" ? savePromptVersion(root, candidate, operation.content)
    : operation.kind === "restore" ? operation.version : undefined
  publishPromptSelection(root, candidate, {
    format: 1, id: randomUUID(), previous: previous.id, modelId,
    kind: operation.kind === "reset" ? (book ? "fallback" : "default") : "version",
    ...(version ? { version } : {}),
  })
  const saved = readPromptState(roots, name, modelId, book)
  if (!saved) throw new PromptFileError("PROMPT_SELECTION_INVALID", "Selected prompt cannot be read")
  return saved
}

function promptVersionDate(version: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})?Z/.exec(version)
  if (!match) return null
  const [, year, month, day, hour, minute, second, millis = "000"] = match
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`)
  return Number.isNaN(date.valueOf()) ? null : date.toISOString()
}
