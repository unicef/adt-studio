// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PIPELINE } from "@adt/types"
import { useStageRun } from "./useStageRun"

const mocks = vi.hoisted(() => ({
  queueRun: vi.fn(),
  runInFlight: { value: false },
  pagesLoading: { value: false },
  stageStates: { value: {} as Record<string, string> },
}))

vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({ apiKey: "sk-test", hasApiKey: true }),
}))

vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: [], isLoading: mocks.pagesLoading.value }),
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({
    queueRun: mocks.queueRun,
    stageState: (stage: string) => mocks.stageStates.value[stage] ?? "idle",
    isRunning: mocks.runInFlight.value,
  }),
}))

const label = "test-book"

function run(slug: string) {
  const { result } = renderHook(() => useStageRun(label, slug))
  result.current.run()
  return result
}

describe("useStageRun", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runInFlight.value = false
    mocks.pagesLoading.value = false
    mocks.stageStates.value = {}
  })

  it("queues Language as its own stage, not the whole range behind it", () => {
    run("translate")

    expect(mocks.queueRun).toHaveBeenCalledOnce()
    expect(mocks.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({ fromStage: "translate", toStage: "translate" }),
    )
  })

  it("scopes every stage to itself, however much upstream output is missing", () => {
    for (const def of PIPELINE) {
      mocks.queueRun.mockClear()
      run(def.name)

      expect(mocks.queueRun).toHaveBeenCalledWith(
        expect.objectContaining({ fromStage: def.name, toStage: def.name }),
      )
    }
  })

  it("does nothing for a slug that is not a pipeline stage", () => {
    const result = run("sign-language")

    expect(result.current.isRunnable).toBe(false)
    expect(result.current.canRun).toBe(false)
    expect(mocks.queueRun).not.toHaveBeenCalled()
  })

  it("queues behind another stage's run so stages can be scheduled back to back", () => {
    mocks.runInFlight.value = true
    mocks.stageStates.value = { storyboard: "running" }
    const result = run("translate")

    expect(result.current.isRunning).toBe(false)
    expect(mocks.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({ fromStage: "translate", toStage: "translate" }),
    )
  })

  it("refuses to queue a stage that is already running", () => {
    mocks.stageStates.value = { translate: "running" }
    const result = run("translate")

    expect(result.current.isRunning).toBe(true)
    expect(mocks.queueRun).not.toHaveBeenCalled()
  })

  it("refuses to queue a stage that is already waiting in the queue", () => {
    mocks.stageStates.value = { translate: "queued" }
    const result = run("translate")

    expect(result.current.isRunning).toBe(true)
    expect(mocks.queueRun).not.toHaveBeenCalled()
  })
})
