// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useStepPrereq } from "./useStepPrereq"

const mocks = vi.hoisted(() => ({
  stageStates: { value: {} as Record<string, string> },
  pages: { value: [] as Array<{ sectionCount: number; hasRendering: boolean }> },
}))

vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: mocks.pages.value }),
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({
    stageState: (stage: string) => mocks.stageStates.value[stage] ?? "idle",
  }),
}))

vi.mock("@/components/pipeline/pipeline-i18n", () => ({
  getStageLabelI18n: (stage: string) => stage,
}))

const label = "test-book"

const prereq = (slug: "speech" | "glossary" | "extract") =>
  renderHook(() => useStepPrereq(label, slug)).result.current

describe("useStepPrereq", () => {
  beforeEach(() => {
    mocks.stageStates.value = {}
    mocks.pages.value = [{ sectionCount: 3, hasRendering: true }]
  })

  it("blocks Speech while Language has neither run nor started", () => {
    expect(prereq("speech").isMet).toBe(false)
  })

  it("unblocks Speech once Language is done", () => {
    mocks.stageStates.value = { translate: "done" }
    const result = prereq("speech")

    expect(result.isMet).toBe(true)
    expect(result.upstreamInFlight).toBe(false)
  })

  it("unblocks Speech while Language is running, so it can be queued behind it", () => {
    mocks.stageStates.value = { translate: "running" }
    const result = prereq("speech")

    expect(result.isMet).toBe(true)
    expect(result.upstreamInFlight).toBe(true)
  })

  it("unblocks Speech while Language is only queued — the queue drains in order", () => {
    mocks.stageStates.value = { translate: "queued" }
    const result = prereq("speech")

    expect(result.isMet).toBe(true)
    expect(result.upstreamInFlight).toBe(true)
  })

  it("keeps trusting artifacts for stages gated on the storyboard", () => {
    expect(prereq("glossary").isMet).toBe(true)
    mocks.pages.value = [{ sectionCount: 3, hasRendering: false }]
    expect(prereq("glossary").isMet).toBe(false)
  })

  it("never blocks a foundation", () => {
    mocks.pages.value = []
    const result = prereq("extract")

    expect(result.upstream).toBeNull()
    expect(result.isMet).toBe(true)
    expect(result.upstreamInFlight).toBe(false)
  })
})
