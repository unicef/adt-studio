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
  readImportedAdtSourceArchive,
} from "./source.js"

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

export function getImportedAdtFeaturesNeedingRegeneration(
  label: string,
  booksDir: string,
): string[] {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!isImportedAdtProject(bookDir)) return []
  let bundle: ReturnType<typeof readAdtBundle>
  try {
    bundle = readAdtBundle(readCurrentImportedAdtSource(safeLabel, booksDir))
  } catch {
    return []
  }

  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const pending: string[] = []
    if (bundle.runtimeFeatures.readAloud) {
      const hasSpeech = bundle.manifest.languages.output.some((archiveLanguage) => {
        const language = normalizeLocale(archiveLanguage)
        const row = storage.getLatestNodeData("tts", language)
          ?? storage.getLatestNodeData("tts", language.replace("-", "_"))
        const parsed = TTSOutput.safeParse(row?.data)
        return parsed.success && parsed.data.entries.length > 0
      })
      if (!hasSpeech) pending.push("Speech")
    }
    if (analyzeImportedActivities(bundle).quizCount > 0) {
      const quizRow = storage.getLatestNodeData("quiz-generation", "book")
      const hasQuizzes = Boolean(
        quizRow
        && typeof quizRow.data === "object"
        && quizRow.data !== null
        && Array.isArray((quizRow.data as { quizzes?: unknown }).quizzes)
        && ((quizRow.data as { quizzes: unknown[] }).quizzes.length > 0),
      )
      if (!hasQuizzes) pending.push("Quizzes")
    }
    if (bundle.runtimeFeatures.easyRead) {
      const easyRead = EasyReadOutput.safeParse(
        storage.getLatestNodeData("easy-read", "book")?.data,
      )
      if (
        !easyRead.success
        || !easyRead.data.blocks.some((block) => block.entries.length > 0)
      ) {
        pending.push("Easy Read")
      }
    }
    if (
      bundle.runtimeFeatures.signLanguage
      && !storage.getSignLanguageVideos().some((video) => video.sectionId !== null)
    ) {
      pending.push("Sign Language")
    }
    return pending
  } finally {
    storage.close()
  }
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
 * manifests and runtime files always win; only missing source assets are copied. */
export function restoreImportedAdtPresentation(label: string, booksDir: string): boolean {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!isImportedAdtProject(bookDir)) return false

  // Every cheap disqualifier runs before the source archive is read: this is
  // called on the packaging cache-hit path, where expanding an archive up to
  // the compressed size limit only to find nothing to do is pure waste.
  const adtDir = path.join(bookDir, "adt")
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
      changed = true
    }
  }
  if (changed) generateOfflinePreloader(adtDir, bundle.manifest.languages.output)
  return changed
}
