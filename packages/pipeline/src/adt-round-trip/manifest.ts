import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import {
  ADT_EDITING_CONTRACT_VERSION,
  ADT_ROUND_TRIP_FORMAT_VERSION,
  AdtRoundTripManifest,
  type AdtExportLineage,
  type TextCatalogOutput,
} from "@adt/types"
import { canonicalJson } from "@adt/types/fingerprint"

import { getBaseLanguage } from "../language-context.js"
import { inspectImportedActivity } from "./activity.js"
import { isImportedFixedLayoutPage } from "./fixed-layout.js"
import { inspectImportedHtmlContract } from "./html.js"

export interface AdtRoundTripManifestPage {
  section_id: string
  href: string
}

export interface BuildAdtRoundTripManifestOptions {
  adtDir: string
  contentDir: string
  label: string
  title: string
  language: string
  outputLanguages: string[]
  pageList: readonly AdtRoundTripManifestPage[]
  catalog: TextCatalogOutput
  catalogVersion: number
  easyReadEntries: ReadonlyArray<{ id: string }>
  glossaryVersion: number | null
  tocVersion: number | null
  translationBaselines: Record<string, number>
  lineage?: AdtExportLineage
}

function hashBuffer(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function fingerprintIds(ids: Iterable<string>): string {
  return createHash("sha256")
    .update(JSON.stringify([...new Set(ids)].sort((a, b) => a.localeCompare(b))))
    .digest("hex")
}

function hashJsonFile(filePath: string): string {
  return hashBuffer(Buffer.from(canonicalJson(JSON.parse(fs.readFileSync(filePath, "utf-8")))))
}

/** Baseline versions for every non-source translation the book currently has,
 * so an import can tell which languages moved since this export. */
export function collectTranslationBaselines(
  language: string,
  outputLanguages: string[],
  getRow: (language: string) => { version: number } | null | undefined,
): Record<string, number> {
  const baselines: Record<string, number> = {}
  for (const lang of outputLanguages) {
    if (getBaseLanguage(lang) === getBaseLanguage(language)) continue
    const row = getRow(lang) ?? getRow(lang.replace("-", "_"))
    if (row) baselines[lang] = row.version
  }
  return baselines
}

/**
 * Build the `manifest.json` editing contract for an exported ADT bundle.
 *
 * Written after every supported projection is final but before the offline
 * preloader snapshots JSON resources, because it fingerprints the page HTML as
 * it will actually ship. The declared data-ids are collected with the same
 * inspection the importer re-runs, so the contract stays self-consistent
 * across a round trip.
 */
export function buildAdtRoundTripManifest(
  options: BuildAdtRoundTripManifestOptions,
): AdtRoundTripManifest {
  const {
    adtDir, contentDir, label, title, language, outputLanguages, pageList,
    catalog, catalogVersion, easyReadEntries, glossaryVersion, tocVersion,
    translationBaselines, lineage,
  } = options

  const sourceTextsPath = path.join(contentDir, "i18n", language, "texts.json")
  const pageHtmlFingerprints: Record<string, string> = {}
  const pageDataIds: Record<string, string[]> = {}
  const activities: Array<{ sectionId: string; href: string; type: string }> = []
  const nonActivities: Array<{ sectionId: string; href: string }> = []

  const pageByHref = new Map(pageList.map((page) => [page.href, page]))
  for (const [href, page] of pageByHref) {
    const filePath = path.join(adtDir, href)
    if (!fs.existsSync(filePath)) continue
    pageHtmlFingerprints[href] = hashBuffer(fs.readFileSync(filePath))
    const html = fs.readFileSync(filePath, "utf8")
    const allowSectionDataId = page.section_id.startsWith("qz")
    // A fixed-layout page has no semantic <section>; its data-ids hang directly
    // off #content.
    const fixedLayoutPage = isImportedFixedLayoutPage(html)
    pageDataIds[href] = inspectImportedHtmlContract(
      html,
      page.section_id,
      { allowSectionDataId, fixedLayoutPage },
    ).dataIds
    const activity = inspectImportedActivity(html, page.section_id, { allowSectionDataId })
    if (activity.isActivity && activity.sectionType) {
      activities.push({ sectionId: page.section_id, href, type: activity.sectionType })
    } else if (activity.explicitNonActivity || activity.signals.length > 0) {
      // Interactive reader controls are not necessarily learning activities.
      // Record that negative classification so a future import does not ask the
      // user or an agent to classify the same page again.
      nonActivities.push({ sectionId: page.section_id, href })
    }
  }

  return AdtRoundTripManifest.parse({
    formatVersion: ADT_ROUND_TRIP_FORMAT_VERSION,
    editingContract: {
      version: ADT_EDITING_CONTRACT_VERSION,
      pageOrder: pageList.map((page) => ({ sectionId: page.section_id, href: page.href })),
      pageDataIds,
      activities,
      nonActivities,
    },
    book: { label, title },
    ...(lineage ? { lineage } : {}),
    languages: { source: language, output: outputLanguages },
    baselines: {
      glossary: glossaryVersion,
      tocGeneration: tocVersion,
      textCatalogTranslations: translationBaselines,
    },
    textCatalog: {
      version: catalogVersion,
      idFingerprint: fingerprintIds(catalog.entries.map((entry) => entry.id)),
    },
    translatableText: {
      idFingerprint: fingerprintIds([
        ...catalog.entries.map((entry) => entry.id),
        ...easyReadEntries.map((entry) => entry.id),
      ]),
    },
    frozen: {
      ...(fs.existsSync(sourceTextsPath)
        ? { sourceTextsFingerprint: hashJsonFile(sourceTextsPath) }
        : {}),
      pageHtmlFingerprints,
    },
  })
}
