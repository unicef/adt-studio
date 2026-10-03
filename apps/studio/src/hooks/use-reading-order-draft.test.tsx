// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import type { ReadingOrderEntry } from "@/api/client"

const saveMutate = vi.fn()
/**
 * Overridable per test. A draft is always a permutation of these slots, so the
 * fixture holds both of the ids the surface below arranges.
 */
let readingOrder: { version: number; order: ReadingOrderEntry[] } = {
  version: 4,
  order: [
    { kind: "section", id: "a" },
    { kind: "section", id: "b" },
  ],
}

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce(
        (text, part, i) => text + part + (i < values.length ? String(values[i]) : ""),
        "",
      )
    },
  }),
}))
vi.mock("./use-reading-order", async () => {
  const actual = await vi.importActual<typeof import("./use-reading-order")>(
    "./use-reading-order",
  )
  return {
    ...actual,
    useReadingOrder: () => ({ data: readingOrder }),
    useSaveReadingOrder: () => ({ mutate: saveMutate, isPending: false }),
  }
})

// The chip shown in the save bar comes from VersionPicker's per-step table, so
// the pending order looks like every other pending change rather than like bare
// body text. Stubbed to a sentinel here: that the provider asks for it is the
// contract; what it renders is VersionPicker's business.
vi.mock("@/components/pipeline/components/VersionPicker", () => ({
  useStepPendingLabel: (step: string) => `chip:${step}`,
}))

/**
 * Stands in for the floating-save registry, exposing the entry as buttons so a
 * test can press Save and Discard the way the shared bar does.
 */
let entry: Record<string, unknown> | null = null
vi.mock("@/components/pipeline/components/floating-save", () => ({
  useFloatingSave: (e: Record<string, unknown>) => {
    entry = e
  },
}))

const { ReadingOrderDraftProvider, useReadingOrderDraft } = await import(
  "./use-reading-order-draft"
)

const NEXT: ReadingOrderEntry[] = [
  { kind: "section", id: "b" },
  { kind: "section", id: "a" },
]

function Surface() {
  const { draft, setDraft, discard } = useReadingOrderDraft()
  return (
    <div>
      <button type="button" onClick={() => setDraft(NEXT)}>
        move
      </button>
      <button type="button" onClick={discard}>
        discard
      </button>
      <span data-testid="draft">{draft ? draft.map((e) => e.id).join(",") : "none"}</span>
    </div>
  )
}

function show(children: ReactNode = <Surface />) {
  render(<ReadingOrderDraftProvider bookLabel="book">{children}</ReadingOrderDraftProvider>)
}

afterEach(() => {
  cleanup()
  saveMutate.mockReset()
  entry = null
  readingOrder = {
    version: 4,
    order: [
      { kind: "section", id: "a" },
      { kind: "section", id: "b" },
    ],
  }
})

describe("ReadingOrderDraftProvider", () => {
  it("holds a move instead of saving it", () => {
    show()
    expect(entry?.dirty).toBe(false)

    fireEvent.click(screen.getByText("move"))

    expect(screen.getByTestId("draft").textContent).toBe("b,a")
    expect(saveMutate).not.toHaveBeenCalled()
    expect(entry?.dirty).toBe(true)
  })

  it("commits the whole arrangement as one save", () => {
    show()
    fireEvent.click(screen.getByText("move"))
    fireEvent.click(screen.getByText("move"))
    ;(entry?.onSave as () => void)()

    // Two moves, one save — the point of holding the draft. Saving on each drop
    // wrote a version per drag, so rearranging a book buried its own history.
    expect(saveMutate).toHaveBeenCalledTimes(1)
    expect(saveMutate.mock.calls[0][0]).toEqual({ items: NEXT, expectedVersion: 4 })
  })

  it("throws the arrangement away on discard, without saving", () => {
    show()
    fireEvent.click(screen.getByText("move"))
    fireEvent.click(screen.getByText("discard"))

    expect(screen.getByTestId("draft").textContent).toBe("none")
    expect(saveMutate).not.toHaveBeenCalled()
    expect(entry?.dirty).toBe(false)
  })

  it("keeps the draft when the save is refused", async () => {
    // The refusal cases are real — a blocking step is running, or someone else
    // saved first — and they are exactly when losing the arrangement hurts.
    saveMutate.mockImplementation((_vars, opts: { onError: (e: Error) => void }) => {
      opts.onError(new Error("step running"))
    })

    show()
    fireEvent.click(screen.getByText("move"))
    await expect((entry?.onSaveStay as () => Promise<void>)()).rejects.toThrow("step running")

    expect(screen.getByTestId("draft").textContent).toBe("b,a")
    expect(entry?.dirty).toBe(true)
  })

  it("drops the draft once the save lands", async () => {
    saveMutate.mockImplementation((_vars, opts: { onSuccess: () => void }) => {
      opts.onSuccess()
    })

    show()
    fireEvent.click(screen.getByText("move"))
    await (entry?.onSaveStay as () => Promise<void>)()

    await waitFor(() => {
      expect(screen.getByTestId("draft").textContent).toBe("none")
    })
    expect(entry?.dirty).toBe(false)
  })

  it("labels itself with the shared per-step chip", () => {
    // Passing a bare string here is what made it render as oversized body text
    // beside every other stage's icon-and-label pill.
    show()
    expect(entry?.label).toBe("chip:reading-order")
  })

  it("declares the reorder as resetting only the package stage", () => {
    // A reorder re-sequences the bundle and the assessment that walks it. If
    // this ever claimed the storyboard chain, the bar would warn users that
    // saving a drag destroys their speech and translations — and it would.
    show()
    expect(entry?.resetStages).toEqual(["package"])
  })

  // A clone or a split saves straight away while the arrangement waits. The
  // draft then named the book's old slots, and the save was refused for good
  // ("missing 1 item(s)") — no drag could add the id, so Discard was the only
  // way out and the arrangement was lost.
  it("takes in a slot the book gained while the arrangement was pending", async () => {
    const { rerender } = render(
      <ReadingOrderDraftProvider bookLabel="book">
        <Surface />
      </ReadingOrderDraftProvider>,
    )
    fireEvent.click(screen.getByText("move"))
    expect(screen.getByTestId("draft").textContent).toBe("b,a")

    // A clone lands: the server now has a third slot, seated after `a`.
    readingOrder = {
      version: 5,
      order: [
        { kind: "section", id: "a" },
        { kind: "section", id: "a2" },
        { kind: "section", id: "b" },
      ],
    }
    rerender(
      <ReadingOrderDraftProvider bookLabel="book">
        <Surface />
      </ReadingOrderDraftProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("draft").textContent).toBe("b,a,a2")
    })

    // And the save it now sends is a permutation the server will accept.
    ;(entry?.onSave as () => void)()
    expect(saveMutate.mock.calls[0][0].items.map((e: ReadingOrderEntry) => e.id)).toEqual([
      "b",
      "a",
      "a2",
    ])
  })

  it("lets go of a slot the book lost while the arrangement was pending", async () => {
    const { rerender } = render(
      <ReadingOrderDraftProvider bookLabel="book">
        <Surface />
      </ReadingOrderDraftProvider>,
    )
    fireEvent.click(screen.getByText("move"))

    readingOrder = { version: 5, order: [{ kind: "section", id: "a" }] }
    rerender(
      <ReadingOrderDraftProvider bookLabel="book">
        <Surface />
      </ReadingOrderDraftProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("draft").textContent).toBe("a")
    })
  })
})
