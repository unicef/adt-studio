import fs from "node:fs"
import path from "node:path"
import { newPackageAttempt, publishPackageAttempt, recoverPackagePublication, writePackageInventory } from "./packaging/publication.js"
import { createBookStorage } from "@adt/storage"
import { loadBookConfig } from "./config.js"
import { prepareSectioningRun } from "./sectioning-lifecycle.js"
import { readGenerationCatalog } from "./generation-catalog.js"
import { packageAdtWeb, computePackagingInputHash } from "./packaging/web.js"
import { runAccessibilityAssessment } from "./accessibility-assessment.js"
import { normalizeLocale } from "./language-context.js"
import { isFixedLayoutBook } from "./fixed-layout-rendering.js"
import type { StageRunOptions, StageRunProgress } from "./stage-execution-options.js"

/** Builds into a book-owned attempt directory. The prior bundle is recoverable
 * through publication; cancellation never leaves partially written active HTML.
 * A crash after a rename leaves the backup for explicit recovery, not deletion.
 */
export async function runPackageResume(label: string, options: StageRunOptions, progress: StageRunProgress): Promise<void> {
  if (!options.webAssetsDir) throw new Error("Web runtime assets are required to complete packaging")
  const bookDir = path.join(path.resolve(options.booksDir), label)
  recoverPackagePublication(bookDir)
  prepareSectioningRun(label, options.booksDir, "package", "package", options.configPath)
  const storage = createBookStorage(label, options.booksDir)
  const configDir = options.configDir ?? (options.configPath ? path.join(path.dirname(options.configPath), "config") : path.resolve("config"))
  const read = () => readGenerationCatalog({ storage, config: loadBookConfig(label, options.booksDir, options.configPath), bookDir, promptsDir: options.promptsDir, promptOverridesDir: options.promptOverridesDir, templatesDir: options.templatesDir, configPath: options.configPath, webAssetsDir: options.webAssetsDir, configDir }).find((status) => status.identity.kind === "package")!

  try {
    const before = read()
    if (before.current) { progress.emit({ type: "stage-complete", stage: "package" }); return }
    options.signal?.throwIfAborted()
    const attempt = newPackageAttempt(bookDir)
    const config = loadBookConfig(label, options.booksDir, options.configPath)
    const metadata = storage.getLatestNodeData("metadata", "book")?.data as { title?: string; language_code?: string } | undefined
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")
    const packageOptions = { bookDir, outputDir: path.join(attempt, "adt"), label, language,
      outputLanguages: [...new Set([language, ...(config.output_languages ?? []).map(normalizeLocale)])],
      title: metadata?.title ?? label, webAssetsDir: options.webAssetsDir, promptsDir: options.promptsDir, promptOverridesDir: options.promptOverridesDir, configDir,
      config, speechConfig: config.speech, fixedLayout: isFixedLayoutBook(config), reflowableFont: config.reflowable_font,
      applyBodyBackground: config.apply_body_background, quizMatchBookStyle: config.quiz_generation?.match_book_style ?? true,
    }
    const hash = computePackagingInputHash({ ...packageOptions, storage })
    const events: import("@adt/types").ProgressEvent[] = []
    const stagedProgress = { emit(event: import("@adt/types").ProgressEvent) {
      options.signal?.throwIfAborted()
      if (event.type === "step-complete" || event.type === "step-skip") events.push(event)
      else progress.emit(event)
      options.signal?.throwIfAborted()
    } }
    const result = await packageAdtWeb(storage, { ...packageOptions, bundleVersion: hash.slice(0, 16) }, stagedProgress)
    if (result.warnings.length) throw new Error("Packaging omitted required output; inspect retained source content before retrying")
    const assessment = await runAccessibilityAssessment({ bookDir: attempt, config: config.accessibility_assessment }, stagedProgress)
    const directory = path.join(attempt, "adt")
    fs.writeFileSync(path.join(directory, ".build-hash"), hash)
    fs.writeFileSync(path.join(directory, ".build-version"), hash.slice(0, 16))
    fs.writeFileSync(path.join(directory, ".build-warnings"), "[]")
    writePackageInventory(directory)
    options.signal?.throwIfAborted()
    const current = read()
    if (current.signature !== before.signature || current.contentHash !== before.contentHash) throw new Error("Packaging inputs changed during generation")
    const expectedVersion = Math.max(0, ...storage.getAllNodeVersions("accessibility-assessment", "book").map((row) => row.version)) + 2
    publishPackageAttempt(bookDir, attempt, () => storage.transaction(() => {
      options.signal?.throwIfAborted()
      const version = storage.putNodeData("accessibility-assessment", "book", assessment)
      const output = read()
      storage.putNodeData("accessibility-assessment", "book", { ...assessment,
        generationEvidence: { source: "ai", input: { signature: before.signature, contentHash: output.contentHash, references: [{ node: "accessibility-assessment", itemId: "book", version }] } },
      })
    }), { version: expectedVersion, artifactHash: assessment.artifactHash! })
    events.forEach((event) => progress.emit(event))
    progress.emit({ type: "stage-complete", stage: "package" })
  } finally { storage.close() }
}
