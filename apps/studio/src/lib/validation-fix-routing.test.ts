import { describe, expect, it } from "vitest"
import { ValidationFixStage } from "@adt/types"
import { hasStagePages } from "@/components/pipeline/stage-config"
import type { ReviewerValidationCriterion, ReviewerValidationSection } from "@adt/types"
import {
  deriveSectionIdFromHref,
  resolveAccessibilityFixStage,
  resolveReviewerFixStage,
  resolveLegacyReviewerFixStage,
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
    expect(resolveAccessibilityFixStage("heading-order", "text-alternatives")).toBe("storyboard")
  })

  it("falls back to the category owner", () => {
    expect(resolveAccessibilityFixStage("unknown-rule", "tables")).toBe("storyboard")
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
    expect(resolveReviewerFixStage(section({ id: "custom", fix_stage: undefined }), criterion())).toBe("storyboard")
  })

  it.each([
    ["text-extracted-accuracy", "sectioning"],
    ["visual-media-image-description", "captions"],
    ["audio-voice-over", "speech"],
    ["easy-read", "easy-read"],
    ["glossary", "glossary"],
    ["interactivity", "storyboard"],
    ["typography-layout-visual-readability", "storyboard"],
    ["instructional-content-design", "sectioning"],
    ["translation", "translate"],
    ["sign-language", "sign-language"],
  ] as const)("routes historical default section %s to %s", (sectionId, expectedStage) => {
    expect(resolveReviewerFixStage(
      section({ id: sectionId, fix_stage: undefined }),
      criterion({ fix_stage: undefined }),
    )).toBe(expectedStage)
  })
})

describe("deriveSectionIdFromHref", () => {
  it("derives conventional section ids without treating arbitrary pages as sections", () => {
    expect(deriveSectionIdFromHref("chapters/pg001_sec002.xhtml?lang=en#top")).toBe("pg001_sec002")
    expect(deriveSectionIdFromHref("index.html")).toBeNull()
    expect(deriveSectionIdFromHref("quiz.html")).toBeNull()
  })
})

const inventory = [
  { pageId: "pg001", sections: [{ sectionId: "pg001_sec002", isPruned: false, hasStableId: true }] },
] as Parameters<typeof resolveValidationFixDestination>[1]

describe("resolveValidationFixDestination", () => {
  it.each(ValidationFixStage.options)("uses the registered capability for %s", (stage) => {
    const result = resolveValidationFixDestination({ stage, pageId: "pg001", sectionId: "pg001_sec002" }, inventory)
    expect(result.kind).toBe(hasStagePages(stage) ? "page" : "stage")
    expect(result.stage).toBe(stage)
    if (result.kind === "page") expect(result.pageId).toBe("pg001")
  })

  it("creates an exact section deep link for section-aware page stages", () => {
    expect(resolveValidationFixDestination({
      stage: "sectioning",
      pageId: "pg001",
      sectionId: "pg001_sec002",
    }, inventory)).toEqual({
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
    }, inventory)).toEqual({ kind: "page", stage: "speech", pageId: "pg001" })
  })

  it("uses a stage root when the owner has no page route or page context is absent", () => {
    expect(resolveValidationFixDestination({ stage: "captions", pageId: "pg001" }, inventory))
      .toEqual({ kind: "stage", stage: "captions" })
    expect(resolveValidationFixDestination({ stage: "storyboard" }, inventory))
      .toEqual({ kind: "stage", stage: "storyboard" })
  })
})


describe("safe stable identity resolution", () => {
  it.each(["https://evil/pg001_sec002.html", "//evil/pg001_sec002.html", "/pg001_sec002.html", "../pg001_sec002.html", "chapters/../pg001_sec002.html", "chapters/%2e%2e/pg001_sec002.html", "chapters\\pg001_sec002.html", "javascript:pg001_sec002.html", "pg001_sec002.html extra"])("rejects untrusted hint %s", (href) => {
    expect(deriveSectionIdFromHref(href)).toBeNull()
    expect(resolveValidationFixDestination({ stage: "storyboard", pageId: "pg001", href }, inventory))
      .toEqual({ kind: "page", stage: "storyboard", pageId: "pg001" })
  })

  it("follows a uniquely moved stored ID rather than its prefix or legacy hint", () => {
    const moved = [{ ...inventory[0], pageId: "pg009" }]
    expect(resolveValidationFixDestination({ stage: "storyboard", pageId: "pg001", sectionId: "pg001_sec002", href: "pg001_sec099.html" }, moved))
      .toEqual({ kind: "page", stage: "storyboard", pageId: "pg009", sectionId: "pg001_sec002" })
  })

  it("does not recover a retired stored ID from a different live href", () => {
    expect(resolveValidationFixDestination({ stage: "storyboard", pageId: "pg001", sectionId: "retired", href: "pg001_sec002.html" }, inventory))
      .toEqual({ kind: "page", stage: "storyboard", pageId: "pg001", unavailable: true })
  })

  it("refuses duplicate, pruned and synthesized identities", () => {
    for (const pages of [
      [...inventory, { ...inventory[0], pageId: "pg002" }],
      [{ ...inventory[0], sections: [{ ...inventory[0].sections[0], isPruned: true }] }],
      [{ ...inventory[0], sections: [{ ...inventory[0].sections[0], hasStableId: false }] }],
    ]) {
      expect(resolveValidationFixDestination({ stage: "storyboard", pageId: "pg001", href: "pg001_sec002.html" }, pages))
        .toEqual({ kind: "page", stage: "storyboard", pageId: "pg001", unavailable: true })
    }
  })

  it("uses only fixed historical defaults without current catalog ownership", () => {
    expect(resolveLegacyReviewerFixStage("text-matches-original-reading-order")).toBe("sectioning")
    expect(resolveLegacyReviewerFixStage("unknown-custom-criterion")).toBe("storyboard")
  })
})

it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("treats inherited object property %s as an unknown identifier", (id) => {
  expect(resolveAccessibilityFixStage(id, "text-alternatives")).toBe("captions")
  expect(resolveLegacyReviewerFixStage(id)).toBe("storyboard")
  expect(resolveReviewerFixStage(section({ id }), criterion())).toBe("storyboard")
})
