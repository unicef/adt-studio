import fs from "node:fs"
import path from "node:path"
import { DEFAULT_BASE_PROMPT_MODEL_ID, PromptName, safeParseModelId } from "@adt/types"
import type { ResolvedPromptFile } from "@adt/types"
import { legacyPromptSelection, promptPath, readPromptSelection, PromptFileError, promptDigest, assertWritablePromptRoot } from "./prompt-files.js"

export function resolvePromptModelId(modelId: string | undefined, basePromptModelId = DEFAULT_BASE_PROMPT_MODEL_ID): string | null {
  if (!modelId?.trim()) return null
  const parsed = safeParseModelId(modelId.trim().toLowerCase())
  if (!parsed.ok) throw new PromptFileError("PROMPT_INVALID_MODEL", "Invalid prompt model id")
  const canonical = parsed.value.qualified
  return canonical === basePromptModelId.trim().toLowerCase() ? null : canonical
}

export function promptModelFolderName(modelId: string): string {
  return modelId.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

export function promptNameForModel(name: string, modelId: string | null | undefined, basePromptModelId = DEFAULT_BASE_PROMPT_MODEL_ID): string {
  const model = resolvePromptModelId(modelId ?? undefined, basePromptModelId)
  return model ? `${name}__${promptModelFolderName(model)}` : name
}

/** All production readers use this algorithm: model candidates across all roots,
 * then generic candidates across all roots. Reset applies to one candidate only. */
export function resolvePromptFile(roots: string[], name: string, modelId: string | null): ResolvedPromptFile | null {
  PromptName.parse(name)
  const candidates = modelId ? [`${name}__${promptModelFolderName(modelId)}`, name] : [name]
  const state: string[] = []
  let result: ResolvedPromptFile | null = null
  for (const candidate of candidates) {
    let shippedDefault = false
    for (const [index, root] of roots.entries()) {
      // Bundled legacy overrides are migrated by deployment adapters. A global
      // reset always reads shipped flat bytes, never history in that directory.
      const selection = shippedDefault ? null : readPromptSelection(root, candidate)
      const legacy = selection || shippedDefault ? null : legacyPromptSelection(root, candidate)
      if (selection?.modelId != null && candidate !== name && selection.modelId !== modelId) {
        throw new PromptFileError("PROMPT_MODEL_CONFLICT", "Model id collides with an existing prompt candidate")
      }
      const kind = selection?.kind ?? (legacy === "default" || legacy === "fallback" ? legacy : legacy ? "version" : "flat")
      const version = selection?.version ?? (kind === "version" ? legacy! : undefined)
      state.push(promptDigest([candidate, index, selection ?? legacy]))
      if (kind === "default") { shippedDefault = true; continue }
      if (kind === "fallback") continue
      const files = version ? [promptPath(root, ".versions", candidate, version)] : [
        ...(candidate !== name && modelId ? [promptPath(root, promptModelFolderName(modelId), `${name}.liquid`)] : []),
        promptPath(root, `${candidate}.liquid`),
      ]
      const filePath = files.find((file) => fs.existsSync(file))
      if (!filePath) continue
      const content = fs.readFileSync(filePath, "utf8")
      state.push(promptDigest([candidate, index, content]))
      if (!result) result = {
        root, requestedName: name, resolvedName: candidate, modelId,
        filePath, content, ...(version ? { version } : {}), selectionState: state,
      }
    }
    // Still collect generic selection state: the write destination can be a
    // missing model candidate, or an inherited generic prompt.
  }
  return result
}

export function promptRoots(booksDir: string, bundled: string, overrides?: string, bookRoot?: string): string[] {
  const global = path.resolve(overrides ?? path.join(booksDir, ".adt-studio", "prompt-overrides"))
  assertWritablePromptRoot(bundled, global)
  if (bookRoot) {
    promptPath(booksDir, path.relative(path.resolve(booksDir), path.resolve(bookRoot)))
    assertWritablePromptRoot(bundled, bookRoot)
    assertWritablePromptRoot(global, bookRoot, "global overrides")
  }
  return [...(bookRoot ? [path.resolve(bookRoot)] : []), global, path.resolve(bundled)]
}
