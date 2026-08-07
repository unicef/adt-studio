import { z } from "zod"
import { BookLabel } from "./book.js"
import { AdtExportLineage } from "./project-identity.js"

export const ADT_ROUND_TRIP_FORMAT_VERSION = 1 as const
export const ADT_EDITING_CONTRACT_VERSION = 1 as const

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 digest")
const LocaleCode = z.string().trim().min(2).max(35).regex(
  /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/,
  "Expected a locale code such as en, pt-BR, or sr-Latn",
)
const EntityVersion = z.number().int().positive()

/** Runtime projection written to `content/toc.json`. */
export const AdtBundleTocEntry = z.object({
  section_id: z.string().min(1),
  href: z.string().min(1),
  title: z.string().trim().min(1),
  chapter_id: z.string().min(1),
  // Heading-derived fallback TOCs predate levels and intentionally omit it.
  level: z.number().int().min(1).max(3).optional(),
}).strict()
export type AdtBundleTocEntry = z.infer<typeof AdtBundleTocEntry>

export const AdtBundleToc = z.array(AdtBundleTocEntry).superRefine((entries, ctx) => {
  const seen = new Set<string>()
  for (let index = 0; index < entries.length; index++) {
    const sectionId = entries[index].section_id
    if (seen.has(sectionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "section_id"],
        message: `Duplicate table of contents section id: ${sectionId}`,
      })
    }
    seen.add(sectionId)
  }
})
export type AdtBundleToc = z.infer<typeof AdtBundleToc>

/** Runtime projection written to each locale's `glossary.json`. */
export const AdtBundleGlossaryEntry = z.object({
  word: z.string().trim().min(1),
  definition: z.string(),
  variations: z.array(z.string()),
  emoji: z.string(),
  id: z.string().min(1),
  image: z.string().min(1).optional(),
  video: z.string().min(1).optional(),
}).strict()
export type AdtBundleGlossaryEntry = z.infer<typeof AdtBundleGlossaryEntry>

export const AdtBundleGlossary = z
  .record(z.string(), AdtBundleGlossaryEntry)
  .superRefine((entries, ctx) => {
    const seen = new Set<string>()
    for (const entry of Object.values(entries)) {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate glossary id: ${entry.id}`,
        })
      }
      seen.add(entry.id)
    }
  })
export type AdtBundleGlossary = z.infer<typeof AdtBundleGlossary>

/** Runtime projection written to each locale's `texts.json`. */
export const AdtBundleTexts = z.record(z.string().min(1), z.string())
export type AdtBundleTexts = z.infer<typeof AdtBundleTexts>

/**
 * Versioned merge metadata shipped in `adt/manifest.json`.
 *
 * `textCatalog.idFingerprint` covers the persisted text-catalog node. The
 * separate `translatableText.idFingerprint` also includes Easy Read ids,
 * because those are emitted into texts.json and translated by the pipeline
 * even though they live in their own entity.
 */
export const AdtRoundTripManifest = z.object({
  formatVersion: z.literal(ADT_ROUND_TRIP_FORMAT_VERSION),
  // Optional at the schema layer so older manifests can still be read and
  // diagnosed. Project import compatibility requires this contract and
  // rejects both missing and unsupported versions.
  editingContract: z.object({
    version: z.number().int().positive(),
    pageOrder: z.array(z.object({
      sectionId: z.string().min(1),
      href: z.string().min(1),
    }).strict()).optional(),
    pageDataIds: z.record(z.string().min(1), z.array(z.string().min(1))).optional(),
  }).strict().optional(),
  book: z.object({
    label: BookLabel,
    // Optional for backwards compatibility with v1 bundles created before
    // standalone bundle editing shipped. Readers fall back to index.html.
    title: z.string().trim().min(1).optional(),
  }).strict(),
  // Optional so exports produced before project lineage shipped remain
  // importable through structural matching.
  lineage: AdtExportLineage.optional(),
  languages: z.object({
    source: LocaleCode,
    output: z.array(LocaleCode).min(1),
  }).strict(),
  baselines: z.object({
    glossary: EntityVersion.nullable(),
    tocGeneration: EntityVersion.nullable(),
    textCatalogTranslations: z.record(LocaleCode, EntityVersion),
  }).strict(),
  textCatalog: z.object({
    version: EntityVersion,
    idFingerprint: Sha256,
  }).strict(),
  translatableText: z.object({
    idFingerprint: Sha256,
  }).strict(),
  frozen: z.object({
    // Some exports intentionally contain translated locales only.
    sourceTextsFingerprint: Sha256.optional(),
    pageHtmlFingerprints: z.record(z.string().min(1), Sha256),
  }).strict().optional(),
}).strict().superRefine((manifest, ctx) => {
  const output = new Set(manifest.languages.output)
  if (output.size !== manifest.languages.output.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["languages", "output"],
      message: "Output languages must be unique",
    })
  }
})
export type AdtRoundTripManifest = z.infer<typeof AdtRoundTripManifest>
