import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"
import { normalizeLocale } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { BookMetadata, TextCatalogOutput, type AdtActivityImportDecision } from "@adt/types"

import type { ReadAdtBundle } from "../adt-bundle-reader.js"
import {
  analyzeImportedActivities,
  resolveImportedActivityDecisions,
} from "../adt-activity-reconciliation.js"
import {
  createRecoveredCatalog,
  hasSourceChanges,
  recoveredPageCount,
} from "../adt-import-catalog.js"
import { AdtImportError } from "../adt-import-error.js"
import { FIXED_LAYOUT_CONFIG } from "../adt-import-fixed-layout.js"
import { ADT_IMPORT_IN_PROGRESS_MARKER } from "../adt-import-marker.js"

import { seedImportedFeatures } from "./features.js"
import { seedImportedImages } from "./images.js"
import { seedPages } from "./pages.js"
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
  if (!files[`${bundle.root}index.html`]) {
    throw new AdtImportError("ADT bundle is missing its book entry page")
  }
  const activityReview = analyzeImportedActivities(bundle)
  const activityOverrides = resolveImportedActivityDecisions(activityReview, activityDecisions)

  const sourceLanguage = normalizeLocale(bundle.manifest.languages.source)
  const sourceTexts = bundle.texts[bundle.manifest.languages.source]
  if (!sourceTexts) {
    throw new AdtImportError("The ADT bundle does not contain its source text catalog")
  }
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
  const sourceContentChanged = hasSourceChanges(bundle, catalog, sourceTexts)

  const bookDir = path.join(path.resolve(booksDir), label)
  const createdAt = new Date().toISOString()

  fs.mkdirSync(bookDir, { recursive: true })
  fs.writeFileSync(path.join(bookDir, ADT_IMPORT_IN_PROGRESS_MARKER), JSON.stringify({
    version: 1,
    createdAt,
    sourceLabel: bundle.manifest.book.label,
    sourceFileName: options.sourceFileName ?? null,
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
    const catalogIds = new Set(catalog.entries.map((entry) => entry.id))
    for (const language of outputLanguages) {
      const texts = bundle.texts[language] ?? bundle.texts[language.replace("-", "_")]
      if (!texts) continue
      storage.putNodeData("text-catalog-translation", language, TextCatalogOutput.parse({
        entries: Object.entries(texts)
          .filter(([id]) => catalogIds.has(id))
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
  seedImportedFeatures(label, booksDir, bundle, createdAt)
  seedImportedImages(label, booksDir, bundle, files)
  seedImportedSpeech(label, booksDir, bundle, files, sourceContentChanged, createdAt)
  warnOnUndetectedFixedLayout(bundle, storyboard.fixedLayoutPageCount)
  fs.writeFileSync(path.join(bookDir, "config.yaml"), yaml.dump({
    editing_language: sourceLanguage,
    // The existing Speech UI treats this as the selectable narration list;
    // normal books always include their source language here as well.
    output_languages: [sourceLanguage, ...outputLanguages],
    ...(storyboard.fixedLayoutPageCount > 0 ? FIXED_LAYOUT_CONFIG : {}),
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


