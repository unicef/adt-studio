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
import { previewCoverDataUri } from "./preview-cover.js"
import { recoverableEasyReadIds } from "./easy-read.js"
import { AdtImportError } from "./error.js"
import { createAdtImportRepairGuide } from "./repair-guide.js"
import { recoverImportedQuizzes } from "./quiz.js"
import { recoverImportedSignLanguageVideos } from "./sign-language.js"
import { currentImportedNarration, recoverImportedAudio } from "./speech.js"

/**
 * How each pipeline feature will actually come out of this archive.
 *
 * The archive's `assets/config.json` says which features its *runtime* had
 * switched on, which is not the same question as whether the importer can
 * rebuild them as pipeline entities. Easy Read lives in `texts.json` as
 * `<id>_easy_read` companions and sign language as `videos.json` plus the video
 * files, so both are judged on what the archive actually carries; the runtime
 * flag alone only earns a "needs-regeneration" entry. Reporting a flag as
 * "included" promised the user something `packageAdtWeb` then switched off on
 * the way back out. Quizzes look baked-in but rebuild cleanly, so they too are
 * judged on whether the rebuild actually succeeded rather than on the flag.
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
    /** Narrated entries in the archive, and how many are still current. */
    speech: { kept: number; total: number }
    easyReadEntryCount: number
    signLanguageVideoCount: number
  },
): Record<string, AdtImportFeatureRecovery> {
  const plan: Record<string, AdtImportFeatureRecovery> = {}
  if (recoveredPageCount(bundle.pages) > 0) plan.storyboard = "recovered"
  if (counts.captionedImageCount > 0) plan.captions = "recovered"
  if (counts.glossaryEntryCount > 0) plan.glossary = "recovered"
  if (counts.tocEntryCount > 0) plan.toc = "recovered"
  if (counts.translationLanguageCount > 0) plan.translate = "recovered"
  if (bundle.runtimeFeatures.readAloud) {
    const { kept, total } = counts.speech
    // Narration for text edited after export is withheld and made again, so
    // keeping some but not all of it is a partial recovery, not a full one.
    plan.speech = kept === 0 ? "needs-regeneration" : kept < total ? "partial" : "recovered"
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
  if (counts.easyReadEntryCount > 0) plan["easy-read"] = "recovered"
  else if (bundle.runtimeFeatures.easyRead) plan["easy-read"] = "needs-regeneration"
  if (counts.signLanguageVideoCount > 0) plan["sign-language"] = "recovered"
  else if (bundle.runtimeFeatures.signLanguage) plan["sign-language"] = "needs-regeneration"
  return plan
}

/** How much of the archive's narration the importer can adopt: the same
 * per-entry rule `seedImportedSpeech` applies, counted against every audio
 * file the archive carries. */
function speechRecovery(
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  catalogEntries: ReadonlyArray<{ id: string; text: string }>,
): { kept: number; total: number } {
  const count = (languages: ReturnType<typeof recoverImportedAudio>) => languages
    .reduce((sum, language) => sum + language.entries.length, 0)
  return {
    kept: count(recoverImportedAudio(bundle, files, currentImportedNarration(bundle, files, catalogEntries))),
    total: count(recoverImportedAudio(bundle, files, () => true)),
  }
}

export function previewAdtRecoveryImport(
  zipBuffer: Buffer,
  agentGuideTemplate?: string,
  /** The uploaded file's name, so the repair request can name its output. */
  archiveName?: string,
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
    coverBase64: previewCoverDataUri(bundle.cover),
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
      speech: speechRecovery(bundle, files, catalog.entries),
      easyReadEntryCount: recoverableEasyReadIds(
        sourceTexts,
        new Set(catalog.entries.map((entry) => entry.id)),
      ).length,
      signLanguageVideoCount: recoverImportedSignLanguageVideos(bundle, files).length,
    }),
    agentGuide: createAdtImportRepairGuide(bundle, compatibility, template, activityReview, archiveName),
  }
}
