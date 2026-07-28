import { describe, expect, it } from "vitest"
import type { MathSpeechEvaluationResult } from "@adt/types"
import {
  withAcceptedAnyway,
  withResolvedText,
  withClearedDecision,
  pendingReviewItems,
} from "./math-speech-evaluation-service.js"

function evaluation(): MathSpeechEvaluationResult {
  return {
    generated_at: "2026-07-29T00:00:00.000Z",
    provider: "adt-llm",
    language: "en",
    catalog_version: 1,
    eval_config_hash: "cfg",
    summary: { total: 2, acceptable: 1, unacceptable: 1 },
    items: [
      {
        entry_id: "tx001",
        latex: "$a^m$",
        walker_text: "a^m",
        acceptable: false,
        rationale: "The caret has no spoken form.",
        suggested_text: "a to the power m",
      },
      {
        entry_id: "tx002",
        latex: "$\\frac{2}{5}$",
        walker_text: "2/5",
        acceptable: true,
        rationale: "Reads correctly.",
      },
    ],
  }
}

describe("pendingReviewItems", () => {
  it("lists only flagged entries with no decision yet", () => {
    expect(pendingReviewItems(evaluation()).map((i) => i.entry_id)).toEqual(["tx001"])
  })

  it("is empty when there is no evaluation", () => {
    expect(pendingReviewItems(null)).toEqual([])
  })

  it("drops an entry once it is overridden", () => {
    const next = withAcceptedAnyway(evaluation(), "tx001")
    expect(pendingReviewItems(next)).toEqual([])
  })

  it("drops an entry once it is resolved", () => {
    const next = withResolvedText(evaluation(), "tx001", "a to the power m")
    expect(pendingReviewItems(next)).toEqual([])
  })
})

describe("withAcceptedAnyway", () => {
  it("records the override with a timestamp", () => {
    const item = withAcceptedAnyway(evaluation(), "tx001").items[0]
    expect(item.accepted_anyway).toBe(true)
    expect(item.accepted_anyway_at).toBeTruthy()
  })

  it("clears any previous resolution so the two cannot both apply", () => {
    const resolved = withResolvedText(evaluation(), "tx001", "a to the power m")
    const item = withAcceptedAnyway(resolved, "tx001").items[0]
    expect(item.resolved_text).toBeUndefined()
    expect(item.accepted_anyway).toBe(true)
  })

  it("leaves other entries untouched", () => {
    const items = withAcceptedAnyway(evaluation(), "tx001").items
    expect(items[1].accepted_anyway).toBeUndefined()
  })

  it("updates the accepted_anyway count in the summary", () => {
    expect(withAcceptedAnyway(evaluation(), "tx001").summary.accepted_anyway).toBe(1)
  })
})

describe("withResolvedText", () => {
  it("records the reviewer's wording with a timestamp", () => {
    const item = withResolvedText(evaluation(), "tx001", "a to the power m").items[0]
    expect(item.resolved_text).toBe("a to the power m")
    expect(item.resolved_at).toBeTruthy()
  })

  it("clears a previous override", () => {
    const overridden = withAcceptedAnyway(evaluation(), "tx001")
    const item = withResolvedText(overridden, "tx001", "a to the power m").items[0]
    expect(item.accepted_anyway).toBeUndefined()
    expect(item.resolved_text).toBe("a to the power m")
  })
})

describe("withClearedDecision", () => {
  it("returns an entry to the queue", () => {
    const resolved = withResolvedText(evaluation(), "tx001", "a to the power m")
    const cleared = withClearedDecision(resolved, "tx001")
    expect(cleared.items[0].resolved_text).toBeUndefined()
    expect(pendingReviewItems(cleared).map((i) => i.entry_id)).toEqual(["tx001"])
  })
})
