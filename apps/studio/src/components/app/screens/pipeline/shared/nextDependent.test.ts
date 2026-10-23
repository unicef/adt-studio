import { describe, expect, it } from "vitest"
import { nextDependent } from "./nextDependent"
import type { DockItem, DockState } from "./usePipelineState"

const dock = (states: Record<string, DockState>): DockItem[] =>
  Object.entries(states).map(([slug, state]) => ({ slug, state, pending: 0 }) as unknown as DockItem)

const ENHANCEMENTS_DONE = { quizzes: "done", captions: "done", glossary: "done", toc: "done", "easy-read": "done" } as const

describe("nextDependent", () => {
  it("offers the next stage once everything it waits on has settled", () => {
    expect(nextDependent("captions", dock({ ...ENHANCEMENTS_DONE, translate: "ready", speech: "locked" }))).toBe("translate")
  })

  it("treats stages the book never ran as optional", () => {
    expect(nextDependent("captions", dock({ captions: "done", quizzes: "ready", glossary: "locked", translate: "ready" }))).toBe(
      "translate",
    )
  })

  it("waits while a sibling the next stage depends on is still running or failed", () => {
    expect(nextDependent("captions", dock({ captions: "done", glossary: "running", translate: "ready" }))).toBeNull()
    expect(nextDependent("captions", dock({ captions: "done", toc: "error", translate: "ready" }))).toBeNull()
  })

  it("skips a next stage that has already started", () => {
    expect(nextDependent("captions", dock({ ...ENHANCEMENTS_DONE, translate: "done" }))).toBeNull()
  })

  it("maps the package stage to the validation step", () => {
    expect(nextDependent("speech", dock({ speech: "done", validation: "ready" }))).toBe("validation")
  })

  it("has nothing after steps outside the pipeline", () => {
    expect(nextDependent("sign-language", dock({ "sign-language": "done" }))).toBeNull()
  })
})
