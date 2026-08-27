import { describe, expect, it } from "vitest"
import { PUBLISH_STEPS } from "@adt/types"
import type { PublishChecklistState, PublishStepProgress } from "@/hooks/use-book-publication"
import {
  PUBLISH_STEP_WEIGHTS,
  UNCOUNTED_CEILING,
  aggregatePercent,
  countedFraction,
  publishAggregate,
  uncountedFraction,
} from "./publish-aggregate"

const ORDER = PUBLISH_STEPS.map((step) => step.id)

/** The four step states for "everything before `index` finished, `index` is running". */
function statesAt(index: number, current: PublishChecklistState = "running"): PublishChecklistState[] {
  return ORDER.map((_id, position) =>
    position < index ? "done" : position === index ? current : "pending",
  )
}

function sample(options: {
  index: number
  stepElapsedMs?: number
  progress?: PublishStepProgress | null
  previous?: number
  current?: PublishChecklistState
}) {
  return {
    status: "running" as const,
    stepStates: statesAt(options.index, options.current),
    progress: options.progress ?? null,
    stepElapsedMs: options.stepElapsedMs ?? 0,
    previous: options.previous ?? 0,
  }
}

describe("publishAggregate", () => {
  it("weights the four steps by time, summing to one whole run", () => {
    const total = ORDER.reduce((sum, id) => sum + PUBLISH_STEP_WEIGHTS[id], 0)
    expect(total).toBeCloseTo(1, 10)
  })

  it("uses done/total for a counted step", () => {
    const uploadIndex = ORDER.indexOf("upload")
    const value = publishAggregate(
      sample({ index: uploadIndex, progress: { done: 170, total: 340, unit: "files" } }),
    )
    expect(value).toBeCloseTo(0.15 + 0.05 + 0.75 * 0.5, 10)
  })

  it("starts the upload at the sum of the steps before it, not at zero", () => {
    const uploadIndex = ORDER.indexOf("upload")
    const value = publishAggregate(
      sample({ index: uploadIndex, progress: { done: 0, total: 340, unit: "files" } }),
    )
    expect(value).toBeCloseTo(0.2, 10)
  })

  it("uses the asymptotic time model for an uncounted step", () => {
    const value = publishAggregate(sample({ index: 0, stepElapsedMs: 12_000 }))
    expect(value).toBeCloseTo(0.15 * (1 - Math.exp(-1)), 10)
  })

  it("never lets an uncounted step reach the next step's boundary", () => {
    const forever = publishAggregate(sample({ index: 0, stepElapsedMs: 10 * 60 * 1000 }))
    expect(forever).toBeLessThan(PUBLISH_STEP_WEIGHTS.export)
    expect(uncountedFraction("export", Number.MAX_SAFE_INTEGER)).toBe(UNCOUNTED_CEILING)
  })

  it("falls back to the time model when a counted step reports a zero total", () => {
    const uploadIndex = ORDER.indexOf("upload")
    const value = publishAggregate(
      sample({
        index: uploadIndex,
        progress: { done: 0, total: 0, unit: "files" },
        stepElapsedMs: 6_000,
      }),
    )
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeCloseTo(0.2 + 0.75 * (1 - Math.exp(-1)), 10)
  })

  it("clamps a counted step that overshoots its own total", () => {
    const uploadIndex = ORDER.indexOf("upload")
    const value = publishAggregate(
      sample({ index: uploadIndex, progress: { done: 400, total: 340, unit: "files" } }),
    )
    expect(value).toBeCloseTo(0.95, 10)
    expect(countedFraction({ done: 400, total: 340, unit: "files" })).toBe(1)
  })

  it("never returns less than the value it was last given", () => {
    const uploadIndex = ORDER.indexOf("upload")
    const value = publishAggregate(
      sample({
        index: uploadIndex,
        progress: { done: 10, total: 340, unit: "files" },
        previous: 0.6,
      }),
    )
    expect(value).toBe(0.6)
  })

  it("holds the bar where it stopped when a step fails", () => {
    const uploadIndex = ORDER.indexOf("upload")
    const frozen = publishAggregate(
      sample({ index: uploadIndex, current: "error", previous: 0.62 }),
    )
    expect(frozen).toBe(0.62)
  })

  it("is monotonic across every step boundary of a whole run", () => {
    let previous = 0
    const seen: number[] = []

    const push = (next: Omit<Parameters<typeof sample>[0], "previous">) => {
      const value = publishAggregate(sample({ ...next, previous }))
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
      seen.push(value)
    }

    for (const ms of [0, 500, 4_000, 20_000]) push({ index: 0, stepElapsedMs: ms })
    for (const ms of [0, 1_000, 9_000]) push({ index: 1, stepElapsedMs: ms })
    for (const done of [0, 1, 84, 170, 339, 340]) {
      push({ index: 2, progress: { done, total: 340, unit: "files" } })
    }
    for (const ms of [0, 1_000, 9_000]) push({ index: 3, stepElapsedMs: ms })

    expect(seen[seen.length - 1]).toBeGreaterThan(0.95)
    expect(seen.every((value) => value >= 0 && value <= 1)).toBe(true)
  })

  it("is one at done and zero at idle, whatever it was handed", () => {
    expect(publishAggregate({ ...sample({ index: 2, previous: 0.4 }), status: "done" })).toBe(1)
    expect(publishAggregate({ ...sample({ index: 2, previous: 0.4 }), status: "idle" })).toBe(0)
  })
})

describe("aggregatePercent", () => {
  it("reports whole numbers inside 0–100", () => {
    expect(aggregatePercent(0)).toBe(0)
    expect(aggregatePercent(1)).toBe(100)
    expect(aggregatePercent(0.545)).toBe(55)
    expect(aggregatePercent(-1)).toBe(0)
    expect(aggregatePercent(4)).toBe(100)
    expect(aggregatePercent(Number.NaN)).toBe(0)
  })

  it("cannot decrease while its input does not", () => {
    const values = [0, 0.02, 0.2, 0.2, 0.575, 0.95, 1]
    const percents = values.map(aggregatePercent)
    percents.forEach((percent, index) => {
      if (index > 0) expect(percent).toBeGreaterThanOrEqual(percents[index - 1])
    })
  })
})
