import { describe, expect, it } from "vitest"

import { AdtRoundTripManifest } from "@adt/types"

import type { ReadAdtBundle } from "./adt-bundle-reader.js"
import {
  AdtActivityReviewError,
  analyzeImportedActivities,
  resolveImportedActivityDecisions,
} from "./adt-activity-reconciliation.js"

const HASH = "a".repeat(64)

function bundle(
  html: string,
  options: { version?: number; activities?: Array<{ sectionId: string; href: string; type: string }> } = {},
): ReadAdtBundle {
  const editingContract: Record<string, unknown> = {
    version: options.version ?? 2,
    pageOrder: [{ sectionId: "pg001_sec001", href: "index.html" }],
    pageDataIds: { "index.html": ["text-1"] },
  }
  if (options.activities !== undefined) editingContract.activities = options.activities
  return {
    root: "",
    sourceFormat: "round-trip",
    manifest: AdtRoundTripManifest.parse({
      formatVersion: 1,
      editingContract,
      book: { label: "sample", title: "Sample" },
      languages: { source: "en", output: ["en"] },
      baselines: { glossary: null, tocGeneration: null, textCatalogTranslations: {} },
      textCatalog: { version: 1, idFingerprint: HASH },
      translatableText: { idFingerprint: HASH },
    }),
    title: "Sample",
    cover: null,
    pageCount: 1,
    pages: [{ section_id: "pg001_sec001", href: "index.html" }],
    pageHtml: { "index.html": html },
    runtimeFeatures: {},
    toc: [],
    glossaries: {},
    texts: { en: { "text-1": "Text" } },
    ignoredEdits: { sourceTextsChanged: false, pageHtmlChanged: [], pageHtmlMissing: [] },
  }
}

function page(sectionType: string, body = `<p data-id="text-1">Text</p>`): string {
  return `<div id="content"><section data-section-id="pg001_sec001" data-section-type="${sectionType}">${body}</section></div>`
}

describe("ADT activity reconciliation", () => {
  it("confirms an activity when the v2 inventory and HTML agree", () => {
    const review = analyzeImportedActivities(bundle(page("activity_open_ended_answer", `
      <p data-id="text-1">Write a response</p>
      <textarea data-activity-item="item-1" aria-label="Response"></textarea>
    `), {
      activities: [{
        sectionId: "pg001_sec001",
        href: "index.html",
        type: "activity_open_ended_answer",
      }],
    }))

    expect(review.needsReviewCount).toBe(0)
    expect(review.items[0]).toMatchObject({
      status: "confirmed",
      detectedType: "activity_open_ended_answer",
      declaredType: "activity_open_ended_answer",
      supportsStudioEditing: true,
    })
  })

  it("requires review for externally-added custom activities and unmarked controls", () => {
    const custom = analyzeImportedActivities(bundle(page(
      "activity_custom_crossword",
      `<p data-id="text-1">Crossword</p><button aria-label="Check">Check</button>`,
    ), { activities: [] }))
    expect(custom.items[0].reasons).toContain("missing-declaration")
    expect(custom.items[0]).toMatchObject({ kind: "custom", status: "needs-review" })

    const candidate = analyzeImportedActivities(bundle(page(
      "content",
      `<p data-id="text-1">Your answer</p><input type="text" aria-label="Answer" />`,
    ), { activities: [] }))
    expect(candidate.items[0]).toMatchObject({
      kind: "candidate",
      status: "needs-review",
      suggestedType: "activity_custom_external",
    })
    expect(candidate.items[0].reasons).toContain("interactive-unmarked")
  })

  it("accepts explicit v1 markers and requires decisions only for ambiguous items", () => {
    const legacyReview = analyzeImportedActivities(bundle(page("activity_quiz"), { version: 1 }))
    expect(legacyReview.items[0]).toMatchObject({ status: "confirmed", kind: "quiz" })

    const ambiguous = analyzeImportedActivities(bundle(page(
      "content",
      `<p data-id="text-1">Answer</p><input type="text" />`,
    ), { activities: [] }))
    expect(() => resolveImportedActivityDecisions(ambiguous, [])).toThrow(AdtActivityReviewError)
    expect(resolveImportedActivityDecisions(ambiguous, [{
      sectionId: "pg001_sec001",
      type: "activity_fill_in_the_blank",
    }]).get("pg001_sec001")).toBe("activity_fill_in_the_blank")
    expect(resolveImportedActivityDecisions(ambiguous, [{
      sectionId: "pg001_sec001",
      type: null,
    }]).get("pg001_sec001")).toBe("content")
  })
})
