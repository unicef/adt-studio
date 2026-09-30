import { describe, expect, it } from "vitest"
import type { AppConfig } from "../config.js"
import {
  canonicalJson,
  compareFingerprints,
  computeFingerprint,
} from "../fingerprint.js"

/** Minimal valid-shaped config; `as AppConfig` since the fingerprint only reads
 *  a known key subset and never parses the whole schema. */
function baseConfig(overrides: Record<string, unknown> = {}): AppConfig {
  return {
    structure_types: { paragraph: "Paragraph" },
    role_types: { heading: "Heading" },
    spread_mode: false,
    vector_text_grouping: true,
    layout_type: "textbook",
    editing_language: "en",
    page_sectioning: { prompt: "section_v1", model: "openai:gpt-4o", temperature: 0 },
    ...overrides,
  } as unknown as AppConfig
}

const PDF = "a".repeat(64) // stand-in pdf sha256

describe("computeFingerprint", () => {
  it("excludes start_page/end_page from both hashes (the contract)", () => {
    const full = computeFingerprint({ config: baseConfig(), pdfSha256: PDF })
    const part = computeFingerprint({
      config: baseConfig({ start_page: 51, end_page: 100 }),
      pdfSha256: PDF,
    })
    expect(part.identityHash).toBe(full.identityHash)
    expect(part.semanticsHash).toBe(full.semanticsHash)
    expect(compareFingerprints(full, part)).toEqual({
      identityMatch: true,
      semanticsMatch: true,
    })
  })

  it("changes identityHash when spread_mode flips", () => {
    const a = computeFingerprint({ config: baseConfig({ spread_mode: false }), pdfSha256: PDF })
    const b = computeFingerprint({ config: baseConfig({ spread_mode: true }), pdfSha256: PDF })
    expect(b.identityHash).not.toBe(a.identityHash)
  })

  it("changes identityHash when watermark removal changes", () => {
    const a = computeFingerprint({
      config: baseConfig({ remove_watermarks: true }),
      pdfSha256: PDF,
    })
    const b = computeFingerprint({ config: baseConfig(), pdfSha256: PDF })
    expect(b.identityHash).not.toBe(a.identityHash)
  })

  it("changes identityHash when figure extraction mode changes", () => {
    const a = computeFingerprint({
      config: baseConfig({ figure_extraction_mode: "auto" }),
      pdfSha256: PDF,
    })
    const b = computeFingerprint({
      config: baseConfig({ figure_extraction_mode: "all" }),
      pdfSha256: PDF,
    })
    expect(b.identityHash).not.toBe(a.identityHash)
  })

  it("changes identityHash when the PDF differs", () => {
    const a = computeFingerprint({ config: baseConfig(), pdfSha256: PDF })
    const b = computeFingerprint({ config: baseConfig(), pdfSha256: "b".repeat(64) })
    expect(b.identityHash).not.toBe(a.identityHash)
  })

  it("changes only semanticsHash when a per-page prompt is edited", () => {
    const a = computeFingerprint({ config: baseConfig(), pdfSha256: PDF })
    const b = computeFingerprint({
      config: baseConfig({
        page_sectioning: { prompt: "section_v2", model: "openai:gpt-4o", temperature: 0 },
      }),
      pdfSha256: PDF,
    })
    expect(b.identityHash).toBe(a.identityHash)
    expect(b.semanticsHash).not.toBe(a.semanticsHash)
    expect(compareFingerprints(a, b)).toEqual({
      identityMatch: true,
      semanticsMatch: false,
    })
  })

  it("ignores downstream-stage config (captions/translate) in both hashes", () => {
    const a = computeFingerprint({ config: baseConfig(), pdfSha256: PDF })
    const b = computeFingerprint({
      config: baseConfig({
        image_captioning_grade_level: "advanced",
        image_captioning_user_prompt: "custom",
        image_translation: { enabled: true },
      }),
      pdfSha256: PDF,
    })
    // The merge re-runs these stages on the assembled book, so their config
    // drift must not warn (a contributor running captions shouldn't trip it).
    expect(b.identityHash).toBe(a.identityHash)
    expect(b.semanticsHash).toBe(a.semanticsHash)
  })

  it("does not let book-level prompt fields affect either hash", () => {
    const a = computeFingerprint({ config: baseConfig(), pdfSha256: PDF })
    const b = computeFingerprint({
      config: baseConfig({
        glossary: { prompt: "glossary_v2" },
        quiz_generation: { prompt: "quiz_v2" },
        book_summary: { prompt: "summary_v2" },
      }),
      pdfSha256: PDF,
    })
    expect(b.identityHash).toBe(a.identityHash)
    expect(b.semanticsHash).toBe(a.semanticsHash)
  })

  it("is independent of config key order", () => {
    const a = computeFingerprint({
      config: baseConfig({ render_strategies: { x: { render_type: "llm" }, y: { render_type: "template" } } }),
      pdfSha256: PDF,
    })
    const b = computeFingerprint({
      config: baseConfig({ render_strategies: { y: { render_type: "template" }, x: { render_type: "llm" } } }),
      pdfSha256: PDF,
    })
    expect(b.semanticsHash).toBe(a.semanticsHash)
  })
})

describe("canonicalJson", () => {
  it("sorts object keys recursively and is order-independent", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    )
  })

  it("strips _cached and omits undefined", () => {
    expect(canonicalJson({ a: 1, _cached: { x: 1 }, b: undefined })).toBe('{"a":1}')
  })
})
