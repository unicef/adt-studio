import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { PromptName, PromptModels, safeParseModelId } from "@adt/types"
import {
  PromptFileError, promptPath, listPromptVersionFiles, readPromptSelection,
  legacyPromptSelection, initializePromptSelection, publishPromptSelection,
  writePromptFileExclusive, withPromptGates, assertWritablePromptRoot,
} from "./prompt-files.js"

/** Non-destructive migration. A name collision with different bytes stops before
 * any candidate is selected. Existing target selections always win. */
export async function migratePromptOverrides(bundled: string, target: string, bookRoot?: string): Promise<void> {
  assertWritablePromptRoot(bundled, target)
  if (bookRoot) assertWritablePromptRoot(bundled, bookRoot)
  await withPromptGates([target, ...(bookRoot ? [bookRoot] : [])], () => {
    // Validate metadata before copying anything; a partial/invalid model list
    // must not silently disappear or introduce ambiguous candidate ownership.
    for (const root of [bundled, target]) {
      const file = promptPath(root, ".models.json")
      if (!fs.existsSync(file)) continue
      try {
        const { models } = PromptModels.parse(JSON.parse(fs.readFileSync(file, "utf8")))
        const owners = new Map<string, string>()
        for (const value of models) {
          const parsed = safeParseModelId(value.trim().toLowerCase())
          if (!parsed.ok || parsed.value.usedLegacyDefault) throw new Error("Invalid model")
          const model = parsed.value.qualified
          const folder = model.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
          if (owners.has(folder) && owners.get(folder) !== model) throw new Error("Model collision")
          owners.set(folder, model)
        }
      } catch {
        throw new PromptFileError("PROMPT_MIGRATION_CONFLICT", "Invalid or colliding prompt model metadata; retain both roots and repair the model list")
      }
    }
    const legacyDir = promptPath(bundled, ".versions")
    const names = fs.existsSync(legacyDir)
      ? fs.readdirSync(legacyDir).filter((name) => PromptName.safeParse(name).success)
      : []
    // Preflight every collision, including candidates later in directory order.
    for (const name of names) {
      readPromptSelection(bundled, name)
      for (const version of listPromptVersionFiles(bundled, name)) {
        const source = promptPath(bundled, ".versions", name, version)
        const destination = promptPath(target, ".versions", name, version)
        if (fs.existsSync(destination) && !fs.readFileSync(source).equals(fs.readFileSync(destination))) {
          throw new PromptFileError("PROMPT_MIGRATION_CONFLICT", `Different prompt bytes share legacy version ${name}/${version}; retain both roots and resolve the conflict`)
        }
      }
    }
    for (const name of names) {
      const dir = promptPath(target, ".versions", name)
      // An existing hand-edited target flat file is already an effective target
      // selection. Preserve it instead of replacing it with source history.
      const separator = name.indexOf("__")
      const flat = promptPath(target, `${name}.liquid`)
      const folderFlat = separator < 0 ? flat : promptPath(target, name.slice(separator + 2), `${name.slice(0, separator)}.liquid`)
      if (!fs.existsSync(dir) && (fs.existsSync(flat) || fs.existsSync(folderFlat))) initializePromptSelection(target, name, null)
      if (!fs.existsSync(dir)) {
        // Publish the whole new directory atomically. An interrupted copy is
        // never visible to the resolver and is safe to retry on next startup.
        const stagingRoot = promptPath(target, `.migration-${randomUUID()}`)
        try {
          fs.mkdirSync(promptPath(stagingRoot, ".versions", name), { recursive: true })
          for (const version of listPromptVersionFiles(bundled, name)) {
            writePromptFileExclusive(promptPath(stagingRoot, ".versions", name, version), fs.readFileSync(promptPath(bundled, ".versions", name, version), "utf8"))
          }
          const selected = readPromptSelection(bundled, name)
          const legacy = selected ? null : legacyPromptSelection(bundled, name)
          const kind = selected?.kind ?? (legacy === "default" || legacy === "fallback" ? legacy : legacy ? "version" : "flat")
          const version = selected?.version ?? (kind === "version" ? legacy! : undefined)
          publishPromptSelection(stagingRoot, name, { format: 1, id: randomUUID(), previous: null, modelId: selected?.modelId ?? null, kind, ...(version ? { version } : {}) })
          fs.mkdirSync(promptPath(target, ".versions"), { recursive: true })
          fs.renameSync(promptPath(stagingRoot, ".versions", name), dir)
        } finally { fs.rmSync(stagingRoot, { recursive: true, force: true }) }
      } else {
        if (!readPromptSelection(target, name)) initializePromptSelection(target, name, null)
        for (const version of listPromptVersionFiles(bundled, name)) {
          const destination = promptPath(target, ".versions", name, version)
          if (!fs.existsSync(destination)) writePromptFileExclusive(destination, fs.readFileSync(promptPath(bundled, ".versions", name, version), "utf8"))
        }
      }
    }
    const sourceModels = promptPath(bundled, ".models.json")
    const targetModels = promptPath(target, ".models.json")
    if (fs.existsSync(sourceModels) && !fs.existsSync(targetModels)) {
      writePromptFileExclusive(targetModels, fs.readFileSync(sourceModels, "utf8"))
    }
    // Materialize pointer-less book/global legacy directories before any write.
    for (const root of [target, ...(bookRoot ? [bookRoot] : [])]) {
      const versions = promptPath(root, ".versions")
      if (!fs.existsSync(versions)) continue
      for (const name of fs.readdirSync(versions).filter((name) => PromptName.safeParse(name).success)) {
        if (!readPromptSelection(root, name)) initializePromptSelection(root, name, null)
      }
    }
  })
}
