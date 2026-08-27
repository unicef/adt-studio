import path from "node:path"

import { normalizeLocale, readAdtAgentGuideTemplate } from "@adt/pipeline"
import type { AdtBundleImportPreview, AdtImportFeatureRecovery } from "@adt/types"

import { extractAdtBundleArchiveFiles, readAdtBundle, type ReadAdtBundle } from "./bundle-reader.js"
import { analyzeImportedActivities } from "./activity-reconciliation.js"
import { assessAdtImportCompatibility } from "./compatibility.js"
import {
  compareWithExportBaseline,
  createRecoveredCatalog,
  hasSourceChanges,
  recoveredPageCount,
} from "./catalog.js"
import { AdtImportError } from "./error.js"
import { createAdtImportRepairGuide } from "./repair-guide.js"
import { recoverImportedQuizzes } from "./quiz.js"

/**
 * How each pipeline feature will actually come out of this archive.
 *
 * The archive's `assets/config.json` says which features its *runtime* had
 * switched on, which is not the same question as whether the importer can
 * rebuild them as pipeline entities. Easy Read and sign language have no
 * recoverable entity representation at all: their runtime data is baked into the
 * published bundle, so the import drops them and `packageAdtWeb` writes
 * `easyRead: false` on the way back out. Reporting them as "included" promised
 * the user something the exporter then removed. Quizzes are the opposite case:
 * they look baked-in but rebuild cleanly, so they are judged on whether the
 * rebuild actually succeeded rather than on the runtime flag.
 *
 * `recovered` means an entity is seeded and the feature works after import.
 * `needs-regeneration` means the source publication had it, but it has to be
 * generated again in Studio. Anything absent from the archive is simply
 * available to generate, and is not listed here.
 */
export function planImportedFeatureRecovery(
  bundle: ReturnType<typeof readAdtBundle>,
  counts: {
    captionedImageCount: number
    glossaryEntryCount: number
    tocEntryCount: number
    translationLanguageCount: number
    quizCount: number
    declaredQuizCount: number
    recoverableQuizCount: number
    speechRecoverable: boolean
  },
): Record<string, AdtImportFeatureRecovery> {
  const plan: Record<string, AdtImportFeatureRecovery> = {}
  if (recoveredPageCount(bundle.pages) > 0) plan.storyboard = "recovered"
  if (counts.captionedImageCount > 0) plan.captions = "recovered"
  if (counts.glossaryEntryCount > 0) plan.glossary = "recovered"
  if (counts.tocEntryCount > 0) plan.toc = "recovered"
  if (counts.translationLanguageCount > 0) plan.translate = "recovered"
  if (bundle.runtimeFeatures.readAloud) {
    plan.speech = counts.speechRecoverable ? "recovered" : "needs-regeneration"
  }
  // A generated quiz keeps its text in the shared catalog and its answer key in
  // the quiz page, so it rebuilds into a real entity. Only a quiz missing either
  // half has to be made again.
  // `quizCount` counts pages the activity review reads as a quiz; the recovery
  // only sees generated `qz*` pages. Judge against whichever population is
  // larger so a hand-authored quiz can't be silently reported as recovered, and
  // an undetected generated one can't be reported as absent.
  const quizzesInArchive = Math.max(counts.quizCount, counts.declaredQuizCount)
  if (quizzesInArchive > 0) {
    plan.quizzes = counts.recoverableQuizCount >= quizzesInArchive
      ? "recovered"
      : "needs-regeneration"
  }
  if (bundle.runtimeFeatures.easyRead) plan["easy-read"] = "needs-regeneration"
  if (bundle.runtimeFeatures.signLanguage) plan["sign-language"] = "needs-regeneration"
  return plan
}

/** Whether this archive carries narration audio the importer can adopt. */
function hasRecoverableSpeech(
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  contentChanged: boolean,
): boolean {
  if (!bundle.runtimeFeatures.readAloud || contentChanged) return false
  // Mirror `seedImportedSpeech`: a manifest is not enough — the map has to parse
  // and at least one narration file it names has to be present in the archive.
  return bundle.manifest.languages.output.some((language) => {
    const bytes = files[`${bundle.root}content/i18n/${language}/audios.json`]
    if (!bytes) return false
    let audioMap: unknown
    try {
      audioMap = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return false
    }
    if (!audioMap || typeof audioMap !== "object" || Array.isArray(audioMap)) return false
    return Object.values(audioMap as Record<string, unknown>).some((fileName) => (
      typeof fileName === "string"
      && path.basename(fileName) === fileName
      && files[`${bundle.root}content/i18n/${language}/audio/${fileName}`] !== undefined
    ))
  })
}

export function previewAdtRecoveryImport(
  zipBuffer: Buffer,
  agentGuideTemplate?: string,
): AdtBundleImportPreview {
  const bundle = readAdtBundle(zipBuffer, { includePreviewImages: true })
  if (bundle.pages.length === 0 || Object.keys(bundle.pageHtml).length === 0) {
    throw new AdtImportError("The ADT bundle does not contain recoverable book pages")
  }
  // Expanded once and shared: compatibility and speech recovery both need every
  // archive entry, and this runs on an archive up to the compressed size limit.
  const files = extractAdtBundleArchiveFiles(zipBuffer)

  const sourceLanguage = normalizeLocale(bundle.manifest.languages.source)
  const sourceTexts = bundle.texts[bundle.manifest.languages.source]
  if (!sourceTexts) {
    throw new AdtImportError("The ADT bundle does not contain its source text catalog")
  }
  const { catalog, imageCount, captionedImageCount } = createRecoveredCatalog(
    sourceTexts,
    bundle.pages,
    bundle.pageHtml,
    bundle.sourceFormat === "legacy-studio-export",
  )
  const outputLanguages = [...new Set(
    bundle.manifest.languages.output
      .map((language) => normalizeLocale(language))
      .filter((language) => language !== sourceLanguage),
  )]
  const activityReview = analyzeImportedActivities(bundle, { includePreviews: true })
  const compatibility = assessAdtImportCompatibility(bundle, files)
  const template = agentGuideTemplate ?? readAdtAgentGuideTemplate()
  if (template === null) {
    throw new AdtImportError("ADT Studio repair guide is unavailable")
  }

  const recoveredQuizzes = recoverImportedQuizzes(bundle, sourceTexts)
  const glossaryEntryCount = Object.keys(
    bundle.glossaries[bundle.manifest.languages.source] ?? {},
  ).length
  const translationLanguageCount = outputLanguages.filter((language) => (
    bundle.texts[language] || bundle.texts[language.replace("-", "_")]
  )).length
  const contentChanged = hasSourceChanges(bundle, catalog, sourceTexts)

  return {
    isAdtBundle: true,
    legacyRecovery: bundle.sourceFormat === "legacy-studio-export",
    label: bundle.manifest.book.label,
    title: bundle.title,
    coverBase64: bundle.cover
      ? `data:${bundle.cover.mimeType};base64,${Buffer.from(bundle.cover.bytes).toString("base64")}`
      : null,
    sourceLanguage,
    outputLanguages,
    runtimeFeatures: bundle.runtimeFeatures,
    pageCount: recoveredPageCount(bundle.pages),
    imageCount,
    captionedImageCount,
    glossaryEntryCount,
    tocEntryCount: bundle.toc.length,
    translationLanguageCount,
    contentChanged,
    exportComparisonStatus: compareWithExportBaseline(bundle),
    activityReview,
    compatibility,
    featureRecovery: planImportedFeatureRecovery(bundle, {
      captionedImageCount,
      glossaryEntryCount,
      tocEntryCount: bundle.toc.length,
      translationLanguageCount,
      quizCount: activityReview.quizCount,
      declaredQuizCount: recoveredQuizzes.declaredCount,
      recoverableQuizCount: recoveredQuizzes.quizzes.length,
      speechRecoverable: hasRecoverableSpeech(bundle, files, contentChanged),
    }),
    agentGuide: createAdtImportRepairGuide(bundle, compatibility, template, activityReview),
  }
}
