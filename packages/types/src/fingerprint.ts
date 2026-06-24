import crypto from "node:crypto"
import type { AppConfig } from "./config.js"
import { SCHEMA_VERSION } from "./db.js"

/**
 * Pipeline fingerprint — "the contract" for splitting a book into page-range
 * parts and merging them back.
 *
 * Page ids are deterministic and absolute (`pg051`, or `pg051052` in spread
 * mode), so per-page data from a part is portable into the full book with no
 * id remapping — *provided* both books were extracted from the same PDF with
 * the same extraction-affecting config. The fingerprint is what two machines
 * compute independently to prove that.
 *
 * Two tiers, enforced differently at merge time:
 *
 * - IDENTITY (`identityHash`) — PDF bytes, DB schema, and the config fields
 *   that change extraction output (and therefore page ids). A mismatch means
 *   the pages don't line up; merge must HARD-FAIL.
 * - SEMANTICS (`semanticsHash`) — the per-page prompt/param/model subset and
 *   editing language. A mismatch means pages were processed with different
 *   instructions but still line up structurally; merge WARNS and lets the
 *   coordinator override.
 *
 * Book-level prompt fields (glossary, quiz, toc, summary, speech) are
 * deliberately absent: parts never emit book-level data, and merge always
 * re-runs the book-level stages on the assembled book.
 */

/**
 * Config fields that change extraction output (page ids, page text,
 * positioned text). Any mismatch makes a part's per-page data incompatible
 * with the target book.
 *
 * `start_page` / `end_page` are intentionally NOT here — they define the part
 * window and must not affect the fingerprint. That exclusion is the whole
 * point of the contract.
 */
export const EXTRACTION_CONFIG_KEYS = [
  "spread_mode",
  "vector_text_grouping",
  "layout_type",
] as const

/**
 * Resolved-config fields that feed the per-page steps the merge treats as
 * AUTHORITATIVE — i.e. the Extract / Sectioning / Storyboard stages, whose
 * per-page output is copied in and never re-run. Each `StepConfig`-shaped entry
 * carries its own `model`/`temperature`, so these keys capture model and prompt
 * drift together. A mismatch does not break page-id alignment.
 *
 * Downstream stages (captions, translate, …) are deliberately EXCLUDED: the
 * merge clears and re-runs them on the assembled book, so their config drift is
 * irrelevant to merge safety — and including them produced false positives,
 * since the coordinator's shell never sets them (e.g. a contributor running
 * captions materializes `image_captioning_grade_level` the shell lacks).
 */
export const PER_PAGE_PROMPT_KEYS = [
  // Extract (per-page image processing)
  "image_filters",
  "image_meaningfulness",
  "image_segmentation",
  "image_cropping",
  // Sectioning
  "structure_types",
  "role_types",
  "section_types",
  "pruned_role_types",
  "pruned_section_types",
  "disabled_section_types",
  "generate_activities",
  "page_sectioning",
  "translation",
  // Storyboard
  "default_render_strategy",
  "render_strategies",
  "section_render_strategies",
  "visual_review_prompt",
  "visual_review_max_iterations",
  "storyboard_effort",
  "storyboard_activity_mode",
] as const

export interface PipelineFingerprint {
  /** Fingerprint format version (bump if the hashing scheme changes). */
  version: 1
  identity: {
    /** SHA-256 of the raw source PDF bytes. */
    pdfSha256: string
    /** DB schema version the per-page data was written under. */
    schemaVersion: number
    /** Normalized extraction-affecting config subset. */
    extraction: Record<string, unknown>
  }
  semantics: {
    /** SHA-256 over the canonicalized per-page prompt/param/model subset. */
    promptsHash: string
    editingLanguage: string | null
  }
  /** Hard gate at merge: must be equal or the merge is refused. */
  identityHash: string
  /** Soft gate at merge: a mismatch is surfaced as a warning. */
  semanticsHash: string
}

export interface FingerprintComparison {
  identityMatch: boolean
  semanticsMatch: boolean
}

/**
 * Deterministic JSON serialization: object keys sorted recursively, Zod's
 * lazily-populated `_cached` stripped, and `undefined` values omitted. Reuses
 * the same `_cached` rule as the LLM cache hasher (packages/llm/src/cache.ts)
 * so identical inputs hash identically across machines. Key sorting matters
 * because config objects are assembled in varying key order by `deepMerge`.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    if (key === "_cached") continue
    const normalized = canonicalize(obj[key])
    if (normalized === undefined) continue
    out[key] = normalized
  }
  return out
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "null"
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex")
}

function pick(config: AppConfig, keys: readonly string[]): Record<string, unknown> {
  const source = config as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

/**
 * Compute the pipeline fingerprint from the resolved book config (as returned
 * by `loadBookConfig`) and the SHA-256 of the source PDF bytes.
 */
export function computeFingerprint(input: {
  config: AppConfig
  pdfSha256: string
}): PipelineFingerprint {
  const { config, pdfSha256 } = input

  const identity = {
    pdfSha256,
    schemaVersion: SCHEMA_VERSION,
    extraction: pick(config, EXTRACTION_CONFIG_KEYS),
  }

  const semantics = {
    promptsHash: sha256(canonicalJson(pick(config, PER_PAGE_PROMPT_KEYS))),
    editingLanguage: config.editing_language ?? null,
  }

  return {
    version: 1,
    identity,
    semantics,
    identityHash: sha256(canonicalJson(identity)),
    semanticsHash: sha256(canonicalJson(semantics)),
  }
}

export function compareFingerprints(
  target: PipelineFingerprint,
  incoming: PipelineFingerprint,
): FingerprintComparison {
  return {
    identityMatch: target.identityHash === incoming.identityHash,
    semanticsMatch: target.semanticsHash === incoming.semanticsHash,
  }
}

/** Hash the raw PDF bytes for the identity tier. */
export function hashPdfBytes(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}
