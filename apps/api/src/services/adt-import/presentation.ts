import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import {
  extractImportedHtmlPresentationAssets,
  generateOfflinePreloader,
  normalizeLocale,
  restoreImportedCustomActivityScripts,
} from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { EasyReadOutput, TTSOutput, parseBookLabel } from "@adt/types"

import { extractAdtBundleArchiveFiles, readAdtBundle } from "./bundle-reader.js"
import { analyzeImportedActivities } from "./activity-reconciliation.js"
import { AdtImportError } from "./error.js"
import {
  ImportedAdtSourceError,
  bookDirFor,
  isImportedAdtProject,
  readImportedAdtCurrent,
  readImportedAdtSourceArchive,
  writeImportedAdtCurrent,
} from "./source.js"
import { recoverImportedQuizzes } from "./quiz.js"
import { recoverImportedSignLanguageVideos } from "./sign-language.js"
import { currentImportedNarration, recoverImportedAudio } from "./speech.js"
import { createRecoveredCatalog } from "./catalog.js"

function readCurrentImportedAdtSource(label: string, booksDir: string): Buffer {
  try {
    return readImportedAdtSourceArchive(bookDirFor(label, booksDir))
  } catch (error) {
    if (error instanceof ImportedAdtSourceError) throw new AdtImportError(error.message)
    throw error
  }
}

function within(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}


export function getImportedAdtPresentationAssets(
  label: string,
  booksDir: string,
): { stylesheets: string[]; scripts: string[]; contentClasses: string[] } {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!isImportedAdtProject(bookDir)) {
    return { stylesheets: [], scripts: [], contentClasses: [] }
  }
  let sourceZip: Buffer
  try {
    sourceZip = readCurrentImportedAdtSource(safeLabel, booksDir)
  } catch {
    return { stylesheets: [], scripts: [], contentClasses: [] }
  }
  const bundle = readAdtBundle(sourceZip)
  const stylesheets = new Set<string>()
  const scripts = new Set<string>()
  const contentClasses = new Set<string>()
  for (const html of Object.values(bundle.pageHtml)) {
    const assets = extractImportedHtmlPresentationAssets(html)
    assets.stylesheets.forEach((asset) => stylesheets.add(asset))
    assets.scripts.forEach((asset) => scripts.add(asset))
    assets.contentClasses.forEach((className) => contentClasses.add(className))
  }
  return {
    stylesheets: [...stylesheets],
    scripts: [...scripts],
    contentClasses: [...contentClasses],
  }
}

/** An imported runtime feature the gate tracks. */
export type ImportedAdtFeature = "Speech" | "Quizzes" | "Easy Read" | "Sign Language"

interface ImportedFeatureState {
  /** The archive shipped it, so a package without it would silently lose it. */
  inArchive: boolean
  /** The project holds it now as pipeline entities. */
  present: boolean
  /** The project has ever held it (an empty later version still counts). */
  everPresent: boolean
}

function importedFeatureStates(
  bundle: ReturnType<typeof readAdtBundle>,
  storage: ReturnType<typeof createBookStorage>,
): Record<ImportedAdtFeature, ImportedFeatureState> {
  const speechRows = bundle.manifest.languages.output.map((archiveLanguage) => {
    const language = normalizeLocale(archiveLanguage)
    return storage.getLatestNodeData("tts", language)
      ?? storage.getLatestNodeData("tts", language.replace("-", "_"))
  })
  const quizRow = storage.getLatestNodeData("quiz-generation", "book")
  const easyReadRow = storage.getLatestNodeData("easy-read", "book")
  const easyRead = EasyReadOutput.safeParse(easyReadRow?.data)
  const signVideos = storage.getSignLanguageVideos()
  return {
    Speech: {
      inArchive: Boolean(bundle.runtimeFeatures.readAloud),
      present: speechRows.some((row) => {
        const parsed = TTSOutput.safeParse(row?.data)
        return parsed.success && parsed.data.entries.length > 0
      }),
      everPresent: speechRows.some(Boolean),
    },
    Quizzes: {
      inArchive: analyzeImportedActivities(bundle).quizCount > 0,
      present: Boolean(
        quizRow
        && typeof quizRow.data === "object"
        && quizRow.data !== null
        && Array.isArray((quizRow.data as { quizzes?: unknown }).quizzes)
        && ((quizRow.data as { quizzes: unknown[] }).quizzes.length > 0),
      ),
      everPresent: Boolean(quizRow),
    },
    "Easy Read": {
      inArchive: Boolean(bundle.runtimeFeatures.easyRead),
      present: easyRead.success && easyRead.data.blocks.some((block) => block.entries.length > 0),
      everPresent: Boolean(easyReadRow),
    },
    "Sign Language": {
      inArchive: Boolean(bundle.runtimeFeatures.signLanguage),
      present: signVideos.some((video) => video.sectionId !== null),
      everPresent: signVideos.length > 0,
    },
  }
}

/**
 * Features the archive shipped that the import brought into the project.
 * Recorded at import so that removing one later reads as the user's choice,
 * not as data the import failed to recover.
 */
export function readSeededImportedAdtFeatures(
  label: string,
  booksDir: string,
  bundle: ReturnType<typeof readAdtBundle>,
): ImportedAdtFeature[] {
  const storage = createBookStorage(parseBookLabel(label), booksDir)
  try {
    const states = importedFeatureStates(bundle, storage)
    return (Object.keys(states) as ImportedAdtFeature[])
      .filter((feature) => states[feature].inArchive && states[feature].present)
  } finally {
    storage.close()
  }
}

/** Features the archive carries in a form the import recovers: what an import
 * made before `seededFeatures` was recorded brought into the project. */
function recoverableImportedFeatures(
  bundle: ReturnType<typeof readAdtBundle>,
  files: Record<string, Uint8Array>,
): ImportedAdtFeature[] {
  const sourceTexts = bundle.texts[bundle.manifest.languages.source] ?? {}
  const features: ImportedAdtFeature[] = []
  if (bundle.runtimeFeatures.readAloud) {
    // Only narration the import adopted: still current for its text.
    const { catalog } = createRecoveredCatalog(
      sourceTexts,
      bundle.pages,
      bundle.pageHtml,
      bundle.sourceFormat === "legacy-studio-export",
    )
    if (recoverImportedAudio(bundle, files, currentImportedNarration(bundle, files, catalog.entries)).length > 0) {
      features.push("Speech")
    }
  }
  if (recoverImportedQuizzes(bundle, sourceTexts).quizzes.length > 0) features.push("Quizzes")
  if (Object.entries(sourceTexts).some(([id, text]) => id.endsWith("_easy_read") && text.trim().length > 0)) features.push("Easy Read")
  if (recoverImportedSignLanguageVideos(bundle, files).length > 0) features.push("Sign Language")
  return features
}

/**
 * Imported features a package would silently lose: the archive shipped them,
 * the import could not bring them in, and the project does not have them now.
 * A feature the import did bring in never blocks, even after the user deletes
 * it, and neither does one the export leaves out (`excluded`).
 */
export function getImportedAdtFeaturesNeedingRegeneration(
  label: string,
  booksDir: string,
  excluded: ReadonlySet<ImportedAdtFeature> = new Set(),
): string[] {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!isImportedAdtProject(bookDir)) return []
  let sourceZip: Buffer
  let bundle: ReturnType<typeof readAdtBundle>
  try {
    sourceZip = readCurrentImportedAdtSource(safeLabel, booksDir)
    bundle = readAdtBundle(sourceZip)
  } catch {
    return []
  }
  let seeded: ReadonlySet<string> | null = null
  try {
    const current = readImportedAdtCurrent(bookDir)
    const recorded = current.seededFeatures
    if (Array.isArray(recorded)) {
      seeded = new Set(recorded.filter((f): f is string => typeof f === "string"))
    } else {
      // Imported before `seededFeatures` was recorded: work out once, from the
      // stored archive, which features the import could bring in, and save it.
      const backfilled = recoverableImportedFeatures(bundle, extractAdtBundleArchiveFiles(sourceZip))
      writeImportedAdtCurrent(bookDir, { ...current, seededFeatures: backfilled })
      seeded = new Set(backfilled)
    }
  } catch {
    seeded = null
  }

  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const states = importedFeatureStates(bundle, storage)
    return (Object.keys(states) as ImportedAdtFeature[]).filter((feature) => {
      const state = states[feature]
      if (!state.inArchive || state.present || excluded.has(feature)) return false
      // Without any record, any trace of the feature in the project means it
      // was brought in and later removed.
      const broughtIn = seeded ? seeded.has(feature) || state.everPresent : state.everPresent
      return !broughtIn
    })
  } finally {
    storage.close()
  }
}

function packagedLanguages(adtDir: string): string[] {
  const i18nDir = path.join(adtDir, "content", "i18n")
  if (!fs.existsSync(i18nDir)) return []
  return fs.readdirSync(i18nDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function escapePresentationAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/** Restore supported presentation assets and custom activity registrations
 * after the normal pipeline packager has rebuilt an imported ADT. Generated
 * manifests and runtime files always win; only missing source assets are copied.
 * Book content (`content/**`: texts, audio, glossary, timings) is never copied
 * back: the packager decides what ships, including languages and features left
 * out of this export. */
function refreshPageHtmlFingerprints(adtDir: string, hrefs: string[]): void {
  const manifestPath = path.join(adtDir, "manifest.json")
  if (!fs.existsSync(manifestPath)) return
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    frozen?: { pageHtmlFingerprints?: Record<string, string> }
  }
  const fingerprints = manifest.frozen?.pageHtmlFingerprints
  if (!fingerprints) return
  for (const href of hrefs) {
    if (!(href in fingerprints)) continue
    fingerprints[href] = createHash("sha256").update(fs.readFileSync(path.join(adtDir, href))).digest("hex")
  }
  // Same format the packager writes (writeJson).
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

export function restoreImportedAdtPresentation(label: string, booksDir: string, outputDir?: string): boolean {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!isImportedAdtProject(bookDir)) return false

  // Every cheap disqualifier runs before the source archive is read: this is
  // called on the packaging cache-hit path, where expanding an archive up to
  // the compressed size limit only to find nothing to do is pure waste.
  const adtDir = outputDir ?? path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) return false
  let sourceZip: Buffer
  try {
    sourceZip = readCurrentImportedAdtSource(safeLabel, booksDir)
  } catch {
    // The projected database remains packageable even when presentation
    // recovery metadata from an older prototype is incomplete.
    return false
  }
  const bundle = readAdtBundle(sourceZip)
  const files = extractAdtBundleArchiveFiles(sourceZip)

  const presentation = getImportedAdtPresentationAssets(safeLabel, booksDir)
  let changed = false

  for (const [archivePath, bytes] of Object.entries(files)) {
    if (!archivePath.startsWith(bundle.root)) continue
    const relativePath = archivePath.slice(bundle.root.length)
    if (!relativePath || relativePath.endsWith("/") || relativePath.toLowerCase().endsWith(".html")) continue
    if (relativePath.startsWith("content/")) continue
    const outputPath = path.resolve(adtDir, relativePath)
    if (!within(outputPath, adtDir) || fs.existsSync(outputPath)) continue
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, bytes)
    changed = true
  }

  const stylesheetHtml = presentation.stylesheets
    .map((asset) => `    <link href="./${escapePresentationAttribute(asset)}" rel="stylesheet" data-adt-imported-presentation>`)
    .join("\n")
  const pagesPath = path.join(adtDir, "content", "pages.json")
  if (!fs.existsSync(pagesPath)) return false
  const pages = JSON.parse(fs.readFileSync(pagesPath, "utf8")) as Array<{
    section_id?: unknown
    href?: unknown
  }>
  const changedPageHrefs: string[] = []
  for (const page of pages) {
    if (typeof page.href !== "string" || typeof page.section_id !== "string") continue
    const pagePath = path.resolve(adtDir, page.href)
    if (!within(pagePath, adtDir) || !fs.existsSync(pagePath)) continue
    let html = fs.readFileSync(pagePath, "utf8")
    const before = html
    if (stylesheetHtml && !html.includes("data-adt-imported-presentation")) {
      html = html.replace("</head>", `${stylesheetHtml}\n</head>`)
    }
    const sourcePage = bundle.pages.find((candidate) => candidate.section_id === page.section_id)
    if (sourcePage) {
      html = restoreImportedCustomActivityScripts(
        html,
        bundle.pageHtml[sourcePage.href] ?? "",
        page.section_id,
      )
    }
    if (html !== before) {
      fs.writeFileSync(pagePath, html)
      changedPageHrefs.push(page.href)
      changed = true
    }
  }
  // The packager fingerprinted each page before this restore. Refresh those
  // fingerprints so an untouched re-import doesn't read the restored styles
  // and scripts as edits made outside Studio.
  if (changedPageHrefs.length > 0) refreshPageHtmlFingerprints(adtDir, changedPageHrefs)
  if (changed) generateOfflinePreloader(adtDir, packagedLanguages(adtDir))
  return changed
}
