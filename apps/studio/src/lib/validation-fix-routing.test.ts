import { describe, expect, it } from "vitest"
import type { ReviewerValidationCriterion, ReviewerValidationSection } from "@adt/types"
import {
  deriveSectionIdFromHref,
  resolveAccessibilityFixStage,
  resolveReviewerFixStage,
  resolveValidationFixDestination,
} from "./validation-fix-routing"

const criterion = (overrides: Partial<ReviewerValidationCriterion> = {}): ReviewerValidationCriterion => ({
  id: "criterion",
  label: "Criterion",
  guidance: "Guidance",
  requires_comment_on_failure: true,
  requires_suggested_modification_on_failure: false,
  ...overrides,
})

const section = (overrides: Partial<ReviewerValidationSection> = {}): ReviewerValidationSection => ({
  id: "text",
  label: "Text",
  criteria: [criterion()],
  ...overrides,
})

describe("resolveAccessibilityFixStage", () => {
  it("uses a rule override before the broad category", () => {
    expect(resolveAccessibilityFixStage("image-alt", "structure-semantics")).toBe("captions")
    expect(resolveAccessibilityFixStage("heading-order", "text-alternatives")).toBe("sectioning")
  })

  it("falls back to the category owner", () => {
    expect(resolveAccessibilityFixStage("unknown-rule", "tables")).toBe("sectioning")
    expect(resolveAccessibilityFixStage("unknown-rule", "forms-controls")).toBe("storyboard")
  })
})

describe("resolveReviewerFixStage", () => {
  it("prefers criterion metadata over section metadata", () => {
    expect(resolveReviewerFixStage(
      section({ fix_stage: "sectioning" }),
      criterion({ fix_stage: "extract" }),
    )).toBe("extract")
  })

  it("supports section metadata, legacy catalogs, and safe custom defaults", () => {
    expect(resolveReviewerFixStage(section({ fix_stage: "captions" }), criterion())).toBe("captions")
    expect(resolveReviewerFixStage(section(), criterion())).toBe("sectioning")
    expect(resolveReviewerFixStage(section({ id: "custom", fix_stage: undefined }), criterion())).toBe("storyboard")
  })
})

describe("deriveSectionIdFromHref", () => {
  it("derives conventional section ids without treating arbitrary pages as sections", () => {
    expect(deriveSectionIdFromHref("chapters/pg001_sec002.xhtml?lang=en#top")).toBe("pg001_sec002")
    expect(deriveSectionIdFromHref("index.html")).toBeNull()
    expect(deriveSectionIdFromHref("quiz.html")).toBeNull()
  })
})

describe("resolveValidationFixDestination", () => {
  it("creates an exact section deep link for section-aware page stages", () => {
    expect(resolveValidationFixDestination({
      stage: "sectioning",
      pageId: "pg001",
      sectionId: "pg001_sec002",
    })).toEqual({
      kind: "page",
      stage: "sectioning",
      pageId: "pg001",
      sectionId: "pg001_sec002",
    })
  })

  it("keeps page context without a section for other page stages", () => {
    expect(resolveValidationFixDestination({
      stage: "speech",
      pageId: "pg001",
      sectionId: "pg001_sec002",
    })).toEqual({ kind: "page", stage: "speech", pageId: "pg001" })
  })

  it("uses a stage root when the owner has no page route or page context is absent", () => {
    expect(resolveValidationFixDestination({ stage: "captions", pageId: "pg001" }))
      .toEqual({ kind: "stage", stage: "captions" })
    expect(resolveValidationFixDestination({ stage: "storyboard" }))
      .toEqual({ kind: "stage", stage: "storyboard" })
  })
})
