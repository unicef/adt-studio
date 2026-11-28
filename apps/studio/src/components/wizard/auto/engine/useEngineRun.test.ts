// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SetupRecommendation } from "@adt/types"

/** Each recommend() call, with its file, signal and a way to answer it. */
const calls = vi.hoisted(() => [] as { file: File; signal: AbortSignal; answer: (rec: unknown) => void; fail: (e: unknown) => void }[])
vi.mock("./client", () => ({
  useEngineClient: () => ({
    recommend: (file: File, signal: AbortSignal) =>
      new Promise((answer, fail) => {
        calls.push({ file, signal, answer, fail })
      }),
  }),
}))
import { useEngineRun } from "./useEngineRun"

const pdf = (name: string) => new File(["%PDF"], name, { type: "application/pdf" })
const rec = (id: string) => ({ id }) as unknown as SetupRecommendation

afterEach(() => {
  cleanup()
  calls.length = 0
})

describe("useEngineRun", () => {
  it("aborts the run for a file that was replaced, and only the new file's answer lands", async () => {
    const first = pdf("first.pdf")
    const second = pdf("second.pdf")
    const { result, rerender } = renderHook(({ file }) => useEngineRun(file), { initialProps: { file: first as File | null } })
    expect(result.current.status).toBe("running")
    rerender({ file: second })
    expect(calls.map((c) => c.file.name)).toEqual(["first.pdf", "second.pdf"])
    expect(calls[0].signal.aborted).toBe(true)
    expect(calls[1].signal.aborted).toBe(false)

    await act(async () => calls[0].answer(rec("late")))
    expect(result.current.status).toBe("running")
    await act(async () => calls[1].answer(rec("right")))
    await waitFor(() => expect(result.current).toMatchObject({ status: "done", rec: { id: "right" } }))
  })

  it("aborts when the file is cleared, and goes back to idle", () => {
    const { result, rerender } = renderHook(({ file }) => useEngineRun(file), { initialProps: { file: pdf("a.pdf") as File | null } })
    rerender({ file: null })
    expect(calls[0].signal.aborted).toBe(true)
    expect(result.current.status).toBe("idle")
  })

  it("sorts a failure", async () => {
    const file = pdf("a.pdf")
    const { result } = renderHook(() => useEngineRun(file))
    await act(async () => calls[0].fail(Object.assign(new Error("The PDF has no pages"), { status: 422, code: "pdf-no-pages" })))
    await waitFor(() => expect(result.current.status).toBe("failed"))
    expect(result.current.status === "failed" && result.current.failure.kind).toBe("pdf")
  })
})
