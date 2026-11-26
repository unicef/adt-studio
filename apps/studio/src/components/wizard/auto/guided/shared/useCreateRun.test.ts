// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SetupRecommendation } from "@adt/types"
import textbook from "../../lab/fixtures/textbook.json"

// The macros aren't compiled under vitest; the preset constants use them.
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children?: unknown }) => children, useLingui: () => ({ t: (s: TemplateStringsArray) => s.join("") }) }))

const rec = textbook as unknown as SetupRecommendation

const form = { setFieldValue: vi.fn(), state: { values: { label: "Volcanoes" } } }
const creation = { createBook: vi.fn(), willExtract: vi.fn(() => false), startExtract: vi.fn(), openBook: vi.fn() }

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock("../../../core/wizardForm", () => ({ useWizardForm: () => form, defaultWizardValues: {} }))
vi.mock("../../../core/useBookCreation", () => ({
  useBookCreation: () => creation,
  classifyCreateError: (error: unknown) => ({ kind: "unknown", detail: String(error) }),
}))

const { useCreateRun } = await import("./useCreateRun")

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  creation.createBook.mockReset()
})
afterEach(cleanup)

describe("useCreateRun", () => {
  it("reset after a created book clears the runs and unlocks a second book", async () => {
    creation.createBook.mockResolvedValue({ label: "volcanoes" })
    const { result } = renderHook(() => useCreateRun())
    await act(() => result.current.start(rec.settings, rec.id))
    expect(result.current.runs.map((r) => r.status)).toEqual(["done"])
    expect(result.current.locked).toBe(true)

    act(() => result.current.reset())
    expect(result.current.runs).toEqual([])
    expect(result.current.locked).toBe(false)

    await act(() => result.current.start(rec.settings, rec.id))
    expect(creation.createBook).toHaveBeenCalledTimes(2)
    expect(result.current.runs).toHaveLength(1)
  })

  it("doesn't let a create still running for the previous PDF land after a reset", async () => {
    const old = deferred<{ label: string }>()
    creation.createBook.mockReturnValueOnce(old.promise)
    const { result } = renderHook(() => useCreateRun())
    let pending!: Promise<void>
    act(() => {
      pending = result.current.start(rec.settings, rec.id)
    })
    expect(result.current.runs.map((r) => r.status)).toEqual(["saving"])

    act(() => result.current.reset())
    expect(result.current.locked).toBe(false)
    await act(async () => {
      old.resolve({ label: "old-book" })
      await pending
    })
    expect(result.current.runs).toEqual([])

    // The new PDF can be created while the old request was still out.
    creation.createBook.mockResolvedValueOnce({ label: "new-book" })
    await act(() => result.current.start(rec.settings, rec.id))
    await waitFor(() => expect(result.current.runs.map((r) => r.status)).toEqual(["done"]))
    expect(result.current.runs[0]!.label).toBe("new-book")
  })
})
