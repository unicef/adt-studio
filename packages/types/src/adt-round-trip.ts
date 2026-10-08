import { z } from "zod"
import { BookLabel } from "./book.js"
import { AdtExportLineage } from "./project-identity.js"

export const ADT_ROUND_TRIP_FORMAT_VERSION = 1 as const
export const ADT_EDITING_CONTRACT_VERSION = 2 as const
export const ADT_EDITING_CONTRACT_MIN_VERSION = 1 as const

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 digest")
const LocaleCode = z.string().trim().min(2).max(35).regex(
  /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/,
  "Expected a locale code such as en, pt-BR, or sr-Latn",
)
const EntityVersion = z.number().int().positive()

export const AdtActivitySectionType = z.string().regex(
  /^activity_[a-z0-9]+(?:_[a-z0-9]+)*$/,
  "Expected an activity section type such as activity_multiple_choice",
)
export type AdtActivitySectionType = z.infer<typeof AdtActivitySectionType>

/** Stable activity declaration emitted by ADT Studio during packaging. */
export const AdtActivityDeclaration = z.object({
  sectionId: z.string().min(1),
  href: z.string().min(1),
  type: AdtActivitySectionType,
}).strict()
export type AdtActivityDeclaration = z.infer<typeof AdtActivityDeclaration>

/** Explicit negative classification for interactive content that is not a
 * learning activity. This prevents heuristic import review from asking again. */
export const AdtNonActivityDeclaration = z.object({
  sectionId: z.string().min(1),
  href: z.string().min(1),
}).strict()
export type AdtNonActivityDeclaration = z.infer<typeof AdtNonActivityDeclaration>

/** User classification supplied when imported HTML is ambiguous. A null type
 * explicitly confirms that the section is not an activity. */
export const AdtActivityImportDecision = z.object({
  sectionId: z.string().min(1),
  type: AdtActivitySectionType.nullable(),
}).strict()
export type AdtActivityImportDecision = z.infer<typeof AdtActivityImportDecision>

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
    /** Added in editing contract v2. Optional so v1 exports remain importable. */
    activities: z.array(AdtActivityDeclaration).optional(),
    /** Deliberately interactive non-activities confirmed by a human or agent. */
    nonActivities: z.array(AdtNonActivityDeclaration).optional(),
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
  const contract = manifest.editingContract
  const pageOrder = contract?.pageOrder ?? []
  const pageBySection = new Map<string, string>()
  const pageHrefs = new Set<string>()
  for (let index = 0; index < pageOrder.length; index++) {
    const page = pageOrder[index]
    if (pageBySection.has(page.sectionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editingContract", "pageOrder", index, "sectionId"],
        message: `Duplicate page section id: ${page.sectionId}`,
      })
    }
    if (pageHrefs.has(page.href)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editingContract", "pageOrder", index, "href"],
        message: `Duplicate page href: ${page.href}`,
      })
    }
    pageBySection.set(page.sectionId, page.href)
    pageHrefs.add(page.href)
  }

  const classifiedSections = new Map<string, "activity" | "non-activity">()
  const classifications = [
    ...(contract?.activities ?? []).map((entry, index) => ({
      entry,
      index,
      key: "activities" as const,
      classification: "activity" as const,
    })),
    ...(contract?.nonActivities ?? []).map((entry, index) => ({
      entry,
      index,
      key: "nonActivities" as const,
      classification: "non-activity" as const,
    })),
  ]
  for (const { entry, index, key, classification } of classifications) {
    const existing = classifiedSections.get(entry.sectionId)
    if (existing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editingContract", key, index, "sectionId"],
        message: existing === classification
          ? `Duplicate ${classification} section id: ${entry.sectionId}`
          : `Section cannot be both an activity and a non-activity: ${entry.sectionId}`,
      })
    }
    classifiedSections.set(entry.sectionId, classification)
    if (pageOrder.length > 0 && pageBySection.get(entry.sectionId) !== entry.href) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editingContract", key, index, "href"],
        message: `Classification does not match pageOrder: ${entry.sectionId}`,
      })
    }
  }
})
export type AdtRoundTripManifest = z.infer<typeof AdtRoundTripManifest>

// ---------------------------------------------------------------------------
// Import preview payload
//
// The wire contract for `POST /books/preview-import` when the archive is an
// exported ADT bundle. Defined here so the API response and the Studio client
// derive from one schema instead of maintaining parallel hand-written unions.
// ---------------------------------------------------------------------------

export const AdtImportCompatibilityIssueCode = z.enum([
  "missing-editing-contract",
  "unsupported-editing-contract",
  "nested-page",
  "unexpected-bundle-entry",
  "changed-page-structure",
  "missing-content-root",
  "multiple-content-roots",
  "missing-section",
  "multiple-sections",
  "missing-section-type",
  "missing-data-id",
  "duplicate-data-id",
  "image-missing-data-id",
  "remote-asset",
  "unsafe-asset",
  "unsupported-stylesheet",
  "unsupported-script",
  "unsupported-asset-location",
  "missing-asset",
])
export type AdtImportCompatibilityIssueCode = z.infer<typeof AdtImportCompatibilityIssueCode>

export const AdtImportCompatibilityIssue = z.object({
  code: AdtImportCompatibilityIssueCode,
  pageHref: z.string(),
  detail: z.string().optional(),
})
export type AdtImportCompatibilityIssue = z.infer<typeof AdtImportCompatibilityIssue>

export const AdtImportCompatibility = z.object({
  supported: z.boolean(),
  issues: z.array(AdtImportCompatibilityIssue),
})
export type AdtImportCompatibility = z.infer<typeof AdtImportCompatibility>

export const AdtActivityReviewReason = z.enum([
  "missing-declaration",
  "missing-marker",
  "type-mismatch",
  "interactive-unmarked",
  "invalid-structure",
  "missing-page",
])
export type AdtActivityReviewReason = z.infer<typeof AdtActivityReviewReason>

export const AdtImportedActivityReviewItem = z.object({
  sectionId: z.string(),
  href: z.string(),
  declaredType: z.string().nullable(),
  detectedType: z.string().nullable(),
  suggestedType: z.string(),
  kind: z.enum(["quiz", "known", "custom", "candidate"]),
  status: z.enum(["confirmed", "needs-review"]),
  supportsStudioEditing: z.boolean(),
  reasons: z.array(AdtActivityReviewReason),
  signals: z.array(z.string()),
  validationErrors: z.array(z.string()),
  textPreview: z.string(),
  previewHtml: z.string(),
})
export type AdtImportedActivityReviewItem = z.infer<typeof AdtImportedActivityReviewItem>

export const AdtImportedActivityReview = z.object({
  inventoryVersion: z.number().nullable(),
  items: z.array(AdtImportedActivityReviewItem),
  needsReviewCount: z.number(),
  quizCount: z.number(),
  activityCount: z.number(),
  typeOptions: z.array(z.string()),
})
export type AdtImportedActivityReview = z.infer<typeof AdtImportedActivityReview>

export const AdtAgentGuideFileState = z.object({
  present: z.boolean(),
  version: z.number().nullable(),
  current: z.boolean(),
})
export type AdtAgentGuideFileState = z.infer<typeof AdtAgentGuideFileState>

export const AdtAgentGuideReview = z.object({
  status: z.enum(["current", "partial", "outdated", "missing"]),
  currentVersion: z.number(),
  files: z.object({
    agentsMd: AdtAgentGuideFileState,
    claudeMd: AdtAgentGuideFileState,
  }),
  currentGuide: z.string(),
  repairPrompt: z.string(),
  activityPrompt: z.string().nullable(),
})
export type AdtAgentGuideReview = z.infer<typeof AdtAgentGuideReview>

export const AdtImportFeatureRecovery = z.enum(["recovered", "needs-regeneration"])
export type AdtImportFeatureRecovery = z.infer<typeof AdtImportFeatureRecovery>

export const AdtBundleImportPreview = z.object({
  isAdtBundle: z.literal(true),
  legacyRecovery: z.boolean(),
  label: z.string(),
  title: z.string(),
  coverBase64: z.string().nullable(),
  sourceLanguage: z.string(),
  outputLanguages: z.array(z.string()),
  runtimeFeatures: z.record(z.string(), z.boolean()),
  pageCount: z.number(),
  imageCount: z.number(),
  captionedImageCount: z.number(),
  glossaryEntryCount: z.number(),
  tocEntryCount: z.number(),
  translationLanguageCount: z.number(),
  contentChanged: z.boolean(),
  exportComparisonStatus: z.enum(["unchanged", "changed", "unavailable"]),
  activityReview: AdtImportedActivityReview,
  compatibility: AdtImportCompatibility,
  /** Per-feature outcome of this import, keyed by pipeline stage slug. Features
   * the archive does not have at all are absent from the map. */
  featureRecovery: z.record(z.string(), AdtImportFeatureRecovery),
  agentGuide: AdtAgentGuideReview,
})
export type AdtBundleImportPreview = z.infer<typeof AdtBundleImportPreview>
