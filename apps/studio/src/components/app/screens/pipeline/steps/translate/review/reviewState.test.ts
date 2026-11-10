import { describe, expect, it } from "vitest"
import type { TranslationEvaluationStatusResponse } from "@/api/client"
import { countReview, currentReviewItems, matchesReviewFilter, type ReviewItem } from "./reviewState"

const item = (partial: Partial<ReviewItem>): ReviewItem => ({ entry_id: "a", acceptable: true, rationale: "ok", ...partial })

function status(items: ReviewItem[], extra: Partial<TranslationEvaluationStatusResponse> = {}, metadata?: object): TranslationEvaluationStatusResponse {
  return {
    language: "en",
    currentSourceCatalogVersion: 1,
    currentTranslationVersion: 1,
    evaluationVersion: 1,
    isStale: false,
    evaluation: {
      generated_at: "2026-11-06T00:00:00.000Z",
      provider: "adt-llm",
      language: "en",
      source_catalog_version: 1,
      translation_version: 1,
      eval_config_hash: "h",
      summary: {} as never,
      items,
      metadata: metadata as never,
    },
    ...extra,
  }
}

const source = new Map([["a", "um"], ["b", "dois"]])
const target = new Map([["a", "one"], ["b", "two"]])

describe("currentReviewItems", () => {
  it("keeps items that still match the text on screen", () => {
    const map = currentReviewItems(status([item({ source_text: "um", translated_text: "one" }), item({ entry_id: "b", translated_text: "old" })]), ["a", "b"], source, target)
    expect([...map.keys()]).toEqual(["a"])
  })

  it("drops items outside the scope", () => {
    expect(currentReviewItems(status([item({})]), ["b"], source, target).size).toBe(0)
  })

  it("trusts nothing from a stale or partly failed review", () => {
    expect(currentReviewItems(status([item({})], { isStale: true }), ["a"], source, target).size).toBe(0)
    expect(currentReviewItems(status([item({})], {}, { failed_pages: 1 }), ["a"], source, target).size).toBe(0)
    expect(currentReviewItems(null, ["a"], source, target).size).toBe(0)
  })
})

describe("countReview and matchesReviewFilter", () => {
  const items = new Map([
    ["a", item({ entry_id: "a" })],
    ["b", item({ entry_id: "b", acceptable: false })],
    ["c", item({ entry_id: "c", acceptable: false, accepted_anyway: true })],
  ])

  it("counts each outcome once", () => {
    expect(countReview(items)).toEqual({ total: 3, acceptable: 1, needsAttention: 1, acceptedAnyway: 1 })
  })

  it("matches each filter", () => {
    expect(matchesReviewFilter(items.get("b"), "needs-attention")).toBe(true)
    expect(matchesReviewFilter(items.get("c"), "needs-attention")).toBe(false)
    expect(matchesReviewFilter(items.get("c"), "accepted-anyway")).toBe(true)
    expect(matchesReviewFilter(items.get("a"), "acceptable")).toBe(true)
    expect(matchesReviewFilter(undefined, "acceptable")).toBe(false)
    expect(matchesReviewFilter(undefined, "all")).toBe(true)
  })
})
