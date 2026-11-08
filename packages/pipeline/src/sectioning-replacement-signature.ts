import fs from "node:fs"
import path from "node:path"
import { createPromptEngine } from "@adt/llm"
import { configHash, resolveBookPaths, type Storage } from "@adt/storage"
import { loadBookConfig } from "./config.js"
import { BOOK_OUTLINE_NODE, BOOK_OUTLINE_ITEM, buildBookOutlineConfig, readBookOutline } from "./book-outline.js"
import { TYPE_SCALE_NODE, TYPE_SCALE_ITEM } from "./type-scale.js"
import { buildPageSectioningConfig } from "./page-sectioning.js"
import { buildTranslationConfig } from "./translation.js"
import { activeSectioningPages, requiredPartRange } from "./sectioning-window.js"

/** Dynamic Liquid includes cannot use the prompt engine's static fingerprint.
 * For that uncommon case bind the complete prompt roots conservatively, so a
 * changed include cannot spend old consent. This is admission, not cache state. */
function promptRootBasis(roots: readonly string[]): unknown[] {
  const visited = new Set<string>()
  const visit = (file: string): unknown[] => {
    try {
      const actual = fs.realpathSync(file)
      if (visited.has(actual)) return [file, actual]
      visited.add(actual)
      if (fs.statSync(actual).isDirectory()) return [file, ...fs.readdirSync(actual).sort().map(name => visit(path.join(actual, name)))]
      return [file, configHash(fs.readFileSync(actual, "utf8"))]
    } catch (error) { return [file, (error as NodeJS.ErrnoException).code ?? "unreadable"] }
  }
  return roots.map(visit)
}

/** A replacement receipt is scoped to this book, effective configuration and
 * persisted page window. It is admission evidence, not output freshness. */
export function sectioningReplacementSignature(storage: Storage, label: string, booksRoot: string, configPath?: string, promptsDir?: string): string {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  const config = loadBookConfig(label, booksRoot, configPath)
  const range = requiredPartRange(bookDir)
  const outlineStatus = storage.getStepRuns().find(step => step.step === BOOK_OUTLINE_NODE)?.status
  const outlineReady = (outlineStatus === "done" || outlineStatus === "skipped") && !!readBookOutline(storage)
  const sectioning = buildPageSectioningConfig(config)
  const metadata = storage.getLatestNodeData("metadata", "book")?.data as { language_code?: string | null } | undefined
  const translation = buildTranslationConfig(config, metadata?.language_code ?? null)
  const selected = [{ name: sectioning.promptName, model: sectioning.modelId }]
  if (sectioning.maxRefinements > 0) selected.push({ name: sectioning.refinementPromptName, model: sectioning.modelId })
  if (translation) selected.push({ name: translation.promptName, model: translation.modelId })
  if (!outlineReady) {
    const outline = buildBookOutlineConfig(config)
    selected.push(...[outline.promptName, ...(outline.promptName === "book_outline" ? ["book_outline_chunk"] : []), "book_outline_synthesis"].map(name => ({ name, model: outline.modelId })))
  }
  const promptRoots = [path.join(bookDir, "prompts"), ...(promptsDir ? [promptsDir] : [])]
  const engine = createPromptEngine(promptRoots, { basePromptModelId: config.base_prompt_model })
  const prompts = selected.map(({ name, model }) => {
    try {
      const resolved = engine.resolvePrompt(name, { modelId: model })
      // Unlike cache identity, consent binds the selected version as well as
      // resolved content/includes: a byte-identical restore is a new selection.
      return [name, resolved.filePath, engine.fingerprint(name, { modelId: model })]
    } catch (error) {
      // Older usable books may have no installed template. This read must not
      // block opening them; adding/restoring the template changes the receipt.
      return [name, error instanceof Error ? error.message : "unreadable prompt",
        error instanceof Error && error.message.startsWith("Dynamic prompt includes") ? promptRootBasis(promptRoots) : null]
    }
  })
  return configHash(JSON.stringify({
    bookDir, config, range, prompts,
    historyRecovery: storage.getSelectedNodeVersion("history-recovery-state", "book"),
    outline: storage.getSelectedNodeVersion(BOOK_OUTLINE_NODE, BOOK_OUTLINE_ITEM),
    outlineReady,
    typeScale: storage.getSelectedNodeVersion(TYPE_SCALE_NODE, TYPE_SCALE_ITEM),
    metadata: storage.getSelectedNodeVersion("metadata", "book"),
    // Selected versions distinguish a restore or invalidation from the previous
    // input. Extraction records bind image identities without opening asset files.
    pages: activeSectioningPages(storage, config, bookDir).map(page => ({
      page,
      imageFiltering: storage.getSelectedNodeVersion("image-filtering", page.pageId),
      positioned: storage.getSelectedNodeVersion("positioned-text", page.pageId),
      images: storage.getPageImages(page.pageId, true),
    })),
  }))
}
