import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import yaml from "js-yaml"
import { normalizeLocale } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { BookMetadata, TextCatalogOutput, type AdtActivityImportDecision } from "@adt/types"

import { importedReaderSettings } from "../reader-settings.js"
import type { ReadAdtBundle } from "../bundle-reader.js"
import { importedSourceTextIsCurrent, importedTextWasEdited } from "../speech.js"
import { sourceTextsWithEditedImageAlts } from "../image-alts.js"
import {
  analyzeImportedActivities,
  resolveImportedActivityDecisions,
} from "../activity-reconciliation.js"
import {
  createRecoveredCatalog,
  hasSourceChanges,
  recoveredPageCount,
} from "../catalog.js"
import { AdtImportError } from "../error.js"
import { FIXED_LAYOUT_CONFIG } from "../fixed-layout.js"
import { ADT_IMPORT_IN_PROGRESS_MARKER } from "../marker.js"

import { seedImportedCoreTts } from "./core-tts.js"
import { seedImportedEasyRead } from "./easy-read.js"
import { seedImportedFeatures } from "./features.js"
import { seedImportedImages } from "./images.js"
import { seedPages } from "./pages.js"
import { seedImportedSignLanguage } from "./sign-language.js"
import { seedImportedSpeech } from "./speech.js"
import { seedImportedStoryboard, warnOnUndetectedFixedLayout } from "./storyboard.js"
import type { AdtImportInProgressMarker, ImportedAdtSeedResult } from "./types.js"

/**
 * Project an exported ADT bundle into `label` as a normal pipeline project.
 *
 * The caller resolves the final label first and owns cleanup: an in-progress
 * marker keeps the half-written directory out of `listBooks`, and the caller
 * removes the directory if any later import step fails. Both the parsed bundle
 * and the expanded archive are passed in so one import never re-reads the ZIP.
 */
export function seedImportedAdtProject(
  label: string,
  booksDir: string,
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  options: {
    sourceFileName?: string
    activityDecisions?: readonly AdtActivityImportDecision[]
  } = {},
): ImportedAdtSeedResult {
  const activityDecisions = options.activityDecisions ?? []
  if (bundle.pages.length === 0 || Object.keys(bundle.pageHtml).length === 0) {
    throw new AdtImportError("The ADT bundle does not contain recoverable book pages")
  }
  // No index.html requirement: the entry page only redirects to the first page
  // and packaging writes a new one, so its absence must not refuse an import
  // the preview approved (it is only a title fallback in readAdtBundle).
  const activityReview = analyzeImportedActivities(bundle)
  const activityOverrides = resolveImportedActivityDecisions(activityReview, activityDecisions)

  const sourceLanguage = normalizeLocale(bundle.manifest.languages.source)
  const archivedSourceTexts = bundle.texts[bundle.manifest.languages.source]
  if (!archivedSourceTexts) {
    throw new AdtImportError("The ADT bundle does not contain its source text catalog")
  }
  // Image alts edited after export win over the archived catalog description.
  const sourceTexts = sourceTextsWithEditedImageAlts(bundle, archivedSourceTexts)
  const { catalog, htmlEntryCount, ignoredHtmlEntryCount } = createRecoveredCatalog(
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
  const sourceContentChanged = hasSourceChanges(bundle, catalog, archivedSourceTexts)

  const bookDir = path.join(path.resolve(booksDir), label)
  const createdAt = new Date().toISOString()

  fs.mkdirSync(bookDir, { recursive: true })
  fs.writeFileSync(path.join(bookDir, ADT_IMPORT_IN_PROGRESS_MARKER), JSON.stringify({
    version: 1,
    createdAt,
    sourceLabel: bundle.manifest.book.label,
    sourceFileName: options.sourceFileName ?? null,
    // Who is seeding it: the startup sweep only removes an import whose
    // process is gone (see removeAbandonedAdtImports).
    pid: process.pid,
    hostname: os.hostname(),
  } satisfies AdtImportInProgressMarker, null, 2))

  const storage = createBookStorage(label, booksDir)
  try {
    const metadata = BookMetadata.parse({
      title: bundle.title,
      authors: [],
      publisher: null,
      language_code: sourceLanguage,
      cover_page_number: null,
      reasoning: "Imported from an exported ADT bundle using its HTML as the source.",
    })
    storage.putNodeData("metadata", "book", metadata)
    storage.putNodeData("text-catalog", "book", catalog)
    const catalogTexts = new Map(catalog.entries.map((entry) => [entry.id, entry.text]))
    // A translation of text edited after export no longer matches its source:
    // leave it out so it shows as missing and is translated again.
    const sourceIsCurrent = importedSourceTextIsCurrent(bundle)
    const wasEdited = importedTextWasEdited(bundle)
    for (const language of outputLanguages) {
      const archiveLanguage = bundle.texts[language] ? language : language.replace("-", "_")
      const texts = bundle.texts[archiveLanguage]
      if (!texts) continue
      storage.putNodeData("text-catalog-translation", language, TextCatalogOutput.parse({
        entries: Object.entries(texts)
          .filter(([id, text]) => {
            const sourceText = catalogTexts.get(id)
            // A translation updated along with its source is the user's work.
            return sourceText !== undefined
              && (sourceIsCurrent(id, sourceText) || wasEdited(archiveLanguage, id, text))
          })
          .map(([id, text]) => ({ id, text })),
        generatedAt: createdAt,
      }))
    }
    storage.markStepCompleted("text-catalog", "Imported from exported ADT HTML")
    storage.markStepCompleted("catalog-translation", "Recovered from ADT language catalogs")
    storage.markStepSkipped("image-translation")
  } finally {
    storage.close()
  }

  const legacyRecovery = bundle.sourceFormat === "legacy-studio-export"
  seedPages(path.join(bookDir, `${label}.db`), bundle.pages, bundle.pageHtml, legacyRecovery)
  const storyboard = seedImportedStoryboard(
    label,
    booksDir,
    bundle.pages,
    bundle.pageHtml,
    bundle.toc,
    legacyRecovery,
    sourceTexts,
    activityOverrides,
    activityReview,
    activityDecisions,
  )
  seedImportedFeatures(label, booksDir, bundle, createdAt, files)
  const hasEasyRead = seedImportedEasyRead(label, booksDir, bundle, createdAt)
  seedImportedCoreTts(label, booksDir, bundle, files, createdAt)
  seedImportedImages(label, booksDir, bundle, files)
  seedImportedSignLanguage(label, booksDir, bundle, files)
  seedImportedSpeech(label, booksDir, bundle, files, createdAt)
  warnOnUndetectedFixedLayout(bundle, storyboard.fixedLayoutPageCount)
  fs.writeFileSync(path.join(bookDir, "config.yaml"), yaml.dump({
    editing_language: sourceLanguage,
    // The existing Speech UI treats this as the selectable narration list;
    // normal books always include their source language here as well.
    output_languages: [sourceLanguage, ...outputLanguages],
    ...(storyboard.fixedLayoutPageCount > 0 ? FIXED_LAYOUT_CONFIG : {}),
    ...(hasEasyRead ? { easy_read: { enabled: true } } : {}),
    // The reader's default and locked settings, which the next export writes back.
    ...importedReaderSettings(bundle.runtimeConfig),
  }))

  return {
    label,
    title: bundle.title,
    sourceFileName: options.sourceFileName ?? null,
    createdAt,
    coverBase64: bundle.cover
      ? `data:${bundle.cover.mimeType};base64,${Buffer.from(bundle.cover.bytes).toString("base64")}`
      : null,
    sourceLanguage,
    outputLanguages,
    runtimeFeatures: bundle.runtimeFeatures,
    pageCount: recoveredPageCount(bundle.pages),
    catalogEntryCount: catalog.entries.length,
    glossaryEntryCount: Object.keys(bundle.glossaries[bundle.manifest.languages.source] ?? {}).length,
    tocEntryCount: bundle.toc.length,
    translationLanguageCount: outputLanguages.filter((language) => (
      bundle.texts[language] || bundle.texts[language.replace("-", "_")]
    )).length,
    recoveredHtmlEntryCount: htmlEntryCount,
    ignoredHtmlEntryCount,
    contentChanged: sourceContentChanged,
  }
}
