// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReadingOrderResponse } from "@/api/client"

const saveMutate = vi.fn()
const pruneMutate = vi.fn()

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce(
        (text, part, i) => text + part + (i < values.length ? String(values[i]) : ""),
        "",
      )
    },
  }),
}))
vi.mock("@lingui/react", () => ({
  useLingui: () => ({ i18n: { _: (m: { message?: string }) => m.message ?? "" } }),
}))
vi.mock("@lingui/core/macro", () => ({ msg: (s: unknown) => ({ message: String(s) }) }))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))

// The list is virtualized off a scroll container, and jsdom gives every element
// zero height — so the real virtualizer would render no rows at all. Render them
// all instead; this test is about the drag arithmetic, not windowing.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 76,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 76 })),
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}))

const PAGES = [
  {
    pageId: "pg001",
    pageNumber: 1,
    sectionCount: 1,
    hasRendering: true,
    renderingVersion: 1,
    sectioningVersion: 1,
    prunedSections: [],
    sections: [
      {
        sectionId: "pg001_sec001",
        sectionIndex: 0,
        sectionType: "content",
        isActivity: false,
        isPruned: false,
        textPreview: "First page",
      },
    ],
  },
  {
    pageId: "pg002",
    pageNumber: 2,
    sectionCount: 1,
    hasRendering: true,
    renderingVersion: 1,
    sectioningVersion: 1,
    prunedSections: [],
    sections: [
      {
        sectionId: "pg002_sec001",
        sectionIndex: 0,
        sectionType: "content",
        isActivity: false,
        isPruned: false,
        textPreview: "Second page",
      },
    ],
  },
  {
    pageId: "pg003",
    pageNumber: 3,
    sectionCount: 1,
    hasRendering: true,
    renderingVersion: 1,
    sectioningVersion: 1,
    prunedSections: [],
    sections: [
      {
        sectionId: "pg003_sec001",
        sectionIndex: 0,
        sectionType: "content",
        isActivity: false,
        isPruned: true,
        textPreview: "Removed page",
      },
    ],
  },
]

const READING_ORDER: ReadingOrderResponse = {
  version: 4,
  fromStoredOrder: true,
  reconciled: false,
  added: [],
  dropped: [],
  // pg003_sec001 is removed from the book: it holds a slot but is not rendered.
  items: [
    { kind: "section", id: "pg001_sec001", href: "pg001_sec001.html", position: 1, pageId: "pg001", pageNumber: 1 },
    { kind: "section", id: "pg002_sec001", href: "pg002_sec001.html", position: 2, pageId: "pg002", pageNumber: 2 },
  ],
  order: [
    { kind: "section", id: "pg001_sec001" },
    { kind: "section", id: "pg003_sec001" },
    { kind: "section", id: "pg002_sec001" },
  ],
}

vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: PAGES }),
  usePageImage: () => ({ data: null, isLoading: false }),
}))
vi.mock("@/hooks/use-quizzes", () => ({ useQuizzes: () => ({ data: null }) }))
vi.mock("@/hooks/use-reading-order", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-reading-order")>(
    "@/hooks/use-reading-order",
  )
  return {
    ...actual,
    useReadingOrder: () => ({ data: READING_ORDER }),
    useSaveReadingOrder: () => ({ mutate: saveMutate, isPending: false }),
  }
})
vi.mock("@/api/client", () => ({ getSectionScreenshotUrl: () => "screenshot.png" }))
vi.mock("@/hooks/use-toggle-prune", () => ({
  useTogglePrune: () => ({ mutate: pruneMutate, isPending: false }),
}))
vi.mock("./VersionPicker", () => ({ VersionPicker: () => null }))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const { StoryboardIndex, READING_ORDER_DRAG_TYPE } = await import("./StoryboardIndex")

function createDataTransfer() {
  const values = new Map<string, string>()
  return {
    effectAllowed: "none",
    dropEffect: "none",
    get types() {
      return [...values.keys()]
    },
    setData(type: string, value: string) {
      values.set(type, value)
    },
    getData(type: string) {
      return values.get(type) ?? ""
    },
  }
}

/** Row wrappers are the draggable elements; each wraps one row button. */
function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-index]"))
}

/**
 * jsdom has no DragEvent constructor, so `fireEvent.drop(el, { clientY })` never
 * reaches the handler — build the event explicitly instead. The before/after
 * split is the whole behaviour under test, so it has to be stated exactly.
 */
function fireDrag(
  el: HTMLElement,
  type: "dragstart" | "dragover" | "drop",
  dataTransfer: ReturnType<typeof createDataTransfer>,
  clientY = 0,
) {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer })
  Object.defineProperty(event, "clientY", { value: clientY })
  fireEvent(el, event)
}

/** jsdom rects are all zero, so state the midpoint explicitly. */
function stubRect(el: HTMLElement, top: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect)
}

/** Dragging is opt-in; enter the mode the way a user does. */
function enableRearrange() {
  fireEvent.click(screen.getByRole("button", { name: "Rearrange" }))
}

/** Open a row's menu and click one of its actions. */
function useRowMenu(rowIndex: number, action: string) {
  const triggers = screen.getAllByRole("button", { name: "Page actions" })
  // `ActionMenu` is a portalled Radix dropdown: it opens on pointerdown rather
  // than click, and its actions are menuitems outside the row's subtree.
  fireEvent.pointerDown(triggers[rowIndex], { button: 0, ctrlKey: false })
  fireEvent.click(screen.getByRole("menuitem", { name: action }))
}

afterEach(() => {
  cleanup()
  saveMutate.mockReset()
  pruneMutate.mockReset()
  vi.restoreAllMocks()
})

describe("StoryboardIndex reordering", () => {
  it("lists every slot in reading order, numbering only the pages in the book", () => {
    render(<StoryboardIndex bookLabel="book" />)

    // Reading order, not source page order: the removed page sits second.
    expect(screen.getByText("First page")).toBeTruthy()
    expect(screen.getByText("Removed page")).toBeTruthy()
    expect(rows()).toHaveLength(3)

    // Book pages are 1 and 2; the removed slot shows a dash and consumes no number.
    const labels = rows().map(
      (row) => row.querySelector('[data-testid="book-page"]')?.textContent,
    )
    expect(labels).toEqual(["1", "–", "2"])
  })

  it("saves a reordering when a row is dropped below another", () => {
    render(<StoryboardIndex bookLabel="book" />)
    const [first, , third] = rows()

    enableRearrange()

    const dataTransfer = createDataTransfer()
    fireDrag(first, "dragstart", dataTransfer)
    expect(dataTransfer.getData(READING_ORDER_DRAG_TYPE)).toBe("pg001_sec001")

    // Drop on the lower half of the last row → land after it.
    stubRect(third, 100, 40)
    fireDrag(third, "dragover", dataTransfer, 130)
    fireDrag(third, "drop", dataTransfer, 130)

    expect(saveMutate).toHaveBeenCalledTimes(1)
    expect(saveMutate.mock.calls[0][0]).toEqual({
      expectedVersion: 4,
      items: [
        { kind: "section", id: "pg003_sec001" },
        { kind: "section", id: "pg002_sec001" },
        { kind: "section", id: "pg001_sec001" },
      ],
    })
  })

  it("drops above a row when the pointer is in its upper half", () => {
    render(<StoryboardIndex bookLabel="book" />)
    const [, , third] = rows()

    enableRearrange()

    const dataTransfer = createDataTransfer()
    fireDrag(rows()[0], "dragstart", dataTransfer)

    stubRect(third, 100, 40)
    fireDrag(third, "dragover", dataTransfer, 105)
    fireDrag(third, "drop", dataTransfer, 105)

    expect(saveMutate.mock.calls[0][0].items.map((i: { id: string }) => i.id)).toEqual([
      "pg003_sec001",
      "pg001_sec001",
      "pg002_sec001",
    ])
  })

  it("does not reorder by dragging until rearranging is switched on", () => {
    // The whole point of the mode: the page list is something you click
    // through, so a stray drag must not silently rewrite the book.
    render(<StoryboardIndex bookLabel="book" />)
    const [first, , third] = rows()

    expect(first.getAttribute("draggable")).toBe("false")

    const dataTransfer = createDataTransfer()
    fireDrag(first, "dragstart", dataTransfer)
    expect(dataTransfer.getData(READING_ORDER_DRAG_TYPE)).toBe("")

    stubRect(third, 100, 40)
    fireDrag(third, "drop", dataTransfer, 130)
    expect(saveMutate).not.toHaveBeenCalled()

    // Switching it on makes the rows draggable.
    enableRearrange()
    expect(rows()[0].getAttribute("draggable")).toBe("true")
  })

  it("moves a page from its own menu without entering the mode", () => {
    render(<StoryboardIndex bookLabel="book" />)

    useRowMenu(0, "Move down")

    expect(saveMutate).toHaveBeenCalledTimes(1)
    expect(saveMutate.mock.calls[0][0].items.map((i: { id: string }) => i.id)).toEqual([
      "pg003_sec001",
      "pg001_sec001",
      "pg002_sec001",
    ])
  })

  it("removes a page from the book via its menu", () => {
    render(<StoryboardIndex bookLabel="book" />)

    useRowMenu(0, "Remove from book")

    expect(pruneMutate).toHaveBeenCalledWith({ pageId: "pg001", sectionIndex: 0 })
    // Removal is not a reordering, so the order itself is untouched.
    expect(saveMutate).not.toHaveBeenCalled()
  })

  it("offers to add a removed page back", () => {
    render(<StoryboardIndex bookLabel="book" />)

    // Row 1 is the removed page.
    useRowMenu(1, "Add back to book")

    expect(pruneMutate).toHaveBeenCalledWith({ pageId: "pg003", sectionIndex: 0 })
  })

  it("disables the row menu while the storyboard is running", () => {
    render(<StoryboardIndex bookLabel="book" stageRunning />)

    const triggers = screen.getAllByRole("button", { name: "Page actions" })
    expect((triggers[0] as HTMLButtonElement).disabled).toBe(true)
    expect(
      (screen.getByRole("button", { name: "Rearrange" }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it("ignores drags that are not reading-order rows", () => {
    render(<StoryboardIndex bookLabel="book" />)
    enableRearrange()
    const foreign = createDataTransfer()
    foreign.setData("text/plain", "something else")

    fireDrag(rows()[2], "drop", foreign, 130)

    expect(saveMutate).not.toHaveBeenCalled()
  })

  it("moves a row with Alt+ArrowDown", () => {
    render(<StoryboardIndex bookLabel="book" />)

    fireEvent.keyDown(rows()[0], { key: "ArrowDown", altKey: true })

    expect(saveMutate).toHaveBeenCalledTimes(1)
    expect(saveMutate.mock.calls[0][0].items.map((i: { id: string }) => i.id)).toEqual([
      "pg003_sec001",
      "pg001_sec001",
      "pg002_sec001",
    ])
  })

  it("does not reorder while the storyboard stage is running", () => {
    render(<StoryboardIndex bookLabel="book" stageRunning />)

    fireEvent.keyDown(rows()[0], { key: "ArrowDown", altKey: true })
    expect(saveMutate).not.toHaveBeenCalled()
    expect(rows()[0].getAttribute("draggable")).toBe("false")
  })
})
