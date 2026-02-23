import { describe, expect, it } from "vitest"
import { isStepComplete, isStageComplete } from "./run-state"

describe("isStepComplete", () => {
  it("returns true for done", () => {
    expect(isStepComplete("done")).toBe(true)
  })

  it("returns true for skipped", () => {
    expect(isStepComplete("skipped")).toBe(true)
  })

  it("returns false for idle", () => {
    expect(isStepComplete("idle")).toBe(false)
  })

  it("returns false for running", () => {
    expect(isStepComplete("running")).toBe(false)
  })

  it("returns false for error", () => {
    expect(isStepComplete("error")).toBe(false)
  })
})

describe("isStageComplete", () => {
  it("returns true when all steps are done", () => {
    expect(isStageComplete(["done", "done", "done"])).toBe(true)
  })

  it("returns true when all steps are skipped", () => {
    expect(isStageComplete(["skipped", "skipped"])).toBe(true)
  })

  it("returns true for a mix of done and skipped", () => {
    expect(isStageComplete(["done", "skipped", "done"])).toBe(true)
  })

  it("returns false when any step is idle", () => {
    expect(isStageComplete(["done", "idle", "done"])).toBe(false)
  })

  it("returns false when any step is running", () => {
    expect(isStageComplete(["done", "running", "skipped"])).toBe(false)
  })

  it("returns false when any step has error", () => {
    expect(isStageComplete(["done", "error"])).toBe(false)
  })

  it("returns false for empty array", () => {
    expect(isStageComplete([])).toBe(false)
  })
})
