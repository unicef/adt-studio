// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { PageSummaryItem, ReadingOrderResponse } from "@/api/client"

const saveMutate = vi.fn()

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

// Heavy children: the table's own behaviour is what is under test, not the
// editors and dialogs it can open.
vi.mock("./SectionEditToolbar", () => ({ SectionEditToolbar: () => null }))
vi.mock("./ImageCropDialog", () => ({
  ImageCropDialog: () => null,
  pageBoundsToCropRect: () => null,
}))
vi.mock("./AiImageDialog", () => ({ AiImageDialog: () => null }))
vi.mock("@/components/section-tree-editor/SectionTreeEditor", () => ({
  SectionTreeEditor: () => null,
}))

/**
 * Stand in for the real dropdown, rendering one button per action it was
 * actually handed. Which actions a row offers is the contract under test, and
 * this states it without driving a portalled Radix menu.
 */
vi.mock("./SectionActionsDropdown", () => ({
  SectionActionsDropdown: ({
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
  }: {
    onMoveUp?: () => void
    onMoveDown?: () => void
    canMoveUp?: boolean
    canMoveDown?: boolean
  }) => (
    <span data-testid="actions">
      {onMoveUp && (
        <button type="button" data-testid="move-up" disabled={!canMoveUp} onClick={onMoveUp}>
          up
        </button>
      )}
      {onMoveDown && (
        <button type="button" data-testid="move-down" disabled={!canMoveDown} onClick={onMoveDown}>
          down
        </button>
      )}
    </span>
  ),
}))

vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({ apiKey: "sk-test" }),
  useBookStructuredTextAvailability: () => true,
}))
vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({ stageState: () => "idle" }),
}))
vi.mock("@/hooks/use-toggle-prune", () => ({
  useTogglePrune: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/hooks/use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("@/api/client", () => ({ api: {}, BASE_URL: "http://localhost" }))

/**
 * The table renders from the per-page details it fetches, not from the `pages`
 * summaries, so `useQueries` has to hand back real sectioning trees.
 */
function pageDetail(pageId: string, sections: Array<{ id: string; pruned: boolean }>) {
  return {
    pageId,
    pageNumber: Number(pageId.slice(2)),
    sectioningTree: {
      reasoning: "",
      sections: sections.map(({ id, pruned }) => ({
        sectionId: id,
        sectionType: "content",
        isPruned: pruned,
        backgroundColor: "#fff",
        textColor: "#000",
        pageNumber: Number(pageId.slice(2)),
        nodes: [],
      })),
    },
    rendering: { sections: sections.map((_, i) => ({ sectionIndex: i, html: "<p>x</p>" })) },
    images: [],
    extractionWarning: null,
    versions: {
      imageClassification: 1,
      imageCropping: 1,
      sectioning: 1,
      rendering: 1,
      imageCaptioning: 1,
    },
  }
}

const PAGE_DETAILS = [
  pageDetail("pg001", [
    { id: "pg001_sec001", pruned: false },
    { id: "pg001_sec002", pruned: true },
  ]),
  pageDetail("pg002", [{ id: "pg002_sec001", pruned: false }]),
]

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueries: () => PAGE_DETAILS.map((data) => ({ data, isLoading: false })),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: () => undefined }),
}))

/**
 * Two source pages. pg001 has two sections, the second of which is out of the
 * book; pg002 has one. The reading order puts pg002 first and interleaves a
 * quiz, so source order and reading order disagree everywhere.
 */
const PAGES: PageSummaryItem[] = [
  {
    pageId: "pg001",
    pageNumber: 1,
    sectionCount: 2,
    hasRendering: true,
    renderingVersion: 1,
    sectioningVersion: 1,
    prunedSections: [1],
    sections: [
      {
        sectionId: "pg001_sec001",
        sectionIndex: 0,
        sectionType: "content",
        isActivity: false,
        isPruned: false,
        textPreview: "Alpha",
      },
      {
        sectionId: "pg001_sec002",
        sectionIndex: 1,
        sectionType: "content",
        isActivity: false,
        isPruned: true,
        textPreview: "Beta",
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
        textPreview: "Gamma",
      },
    ],
  },
] as unknown as PageSummaryItem[]

const READING_ORDER: ReadingOrderResponse = {
  version: 7,
  fromStoredOrder: true,
  reconciled: false,
  added: [],
  dropped: [],
  items: [
    { kind: "section", id: "pg002_sec001", href: "pg002_sec001.html", position: 1, pageId: "pg002", pageNumber: 2 },
    { kind: "quiz", id: "qz001", href: "qz001.html", position: 2, pageId: "pg002", pageNumber: null },
    { kind: "section", id: "pg001_sec001", href: "pg001_sec001.html", position: 3, pageId: "pg001", pageNumber: 1 },
  ],
  order: [
    { kind: "section", id: "pg002_sec001" },
    { kind: "quiz", id: "qz001" },
    { kind: "section", id: "pg001_sec001" },
    { kind: "section", id: "pg001_sec002" },
  ],
}

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

const { SectioningOverview } = await import("./SectioningOverview")

function show() {
  render(<SectioningOverview bookLabel="book" pages={PAGES} />)
}

function toBookOrder() {
  fireEvent.click(screen.getByRole("button", { name: "Book order" }))
}

/**
 * The `Book pg` cell of every rendered row, in the order they appear. The cell
 * has no test id, so it is found by the three titles it can carry — which also
 * pins that a slot with no book page explains itself rather than just showing
 * a bare dash.
 */
function bookPageCells(): (string | null)[] {
  return Array.from(
    document.querySelectorAll(
      'span[title^="Page "], span[title="Removed from the book"], span[title^="Not in the book yet"]',
    ),
  ).map((el) => el.textContent)
}

/** Move buttons in row order; only book order supplies them. */
function moveButtons(direction: "up" | "down"): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(`[data-testid="move-${direction}"]`),
  )
}

afterEach(() => {
  cleanup()
  saveMutate.mockReset()
})

describe("SectioningOverview row order", () => {
  it("starts grouped under the source PDF page", () => {
    // PDF order is what the structural operations reason about, so it stays
    // the default even once the book has been reordered.
    show()
    const group = screen.getByRole("group", { name: "Row order" })
    const pdf = screen.getByRole("button", { name: "PDF order" })
    expect(group).toBeTruthy()
    expect(pdf.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "Book order" }).getAttribute("aria-pressed")).toBe(
      "false",
    )
  })

  it("shows the book position in both views", () => {
    // The column is the point of contact between the two orders, so it has to
    // be readable from the grouped view too.
    show()
    expect(bookPageCells()).toEqual(["3", "–", "1"])

    toBookOrder()
    // Flat, in reading order, and the removed section still shows a dash.
    expect(bookPageCells()).toEqual(["1", "3", "–"])
  })

  it("leaves quiz slots out of the table", () => {
    // The quiz holds book page 2, but this table edits sections — a row it
    // cannot act on would only be something to click and get nothing from.
    show()
    toBookOrder()

    // Three section rows, no fourth row for the quiz that holds book page 2.
    expect(screen.getAllByTestId("actions")).toHaveLength(3)
    expect(bookPageCells()).toEqual(["1", "3", "–"])
  })

  it("offers a move only in book order, where the row visibly moves", () => {
    show()
    // Grouped under their source page, a moved row would stay put on screen
    // while the book changed underneath it.
    expect(moveButtons("down")).toHaveLength(0)
    expect(moveButtons("up")).toHaveLength(0)

    toBookOrder()
    expect(moveButtons("down")).toHaveLength(3)
  })

  it("steps over the slots the table does not draw", () => {
    // Moving the first row down one *visible* row has to clear the quiz that
    // sits between them in the stored order — the displayed list and the
    // stored list are not the same list.
    show()
    toBookOrder()

    // Row 0 in book order is pg002_sec001.
    fireEvent.click(moveButtons("down")[0])

    expect(saveMutate).toHaveBeenCalledTimes(1)
    expect(saveMutate.mock.calls[0][0]).toEqual({
      expectedVersion: 7,
      items: [
        { kind: "quiz", id: "qz001" },
        { kind: "section", id: "pg001_sec001" },
        { kind: "section", id: "pg002_sec001" },
        { kind: "section", id: "pg001_sec002" },
      ],
    })
  })

  it("offers no move past either end of the visible list", () => {
    show()
    toBookOrder()

    const ups = moveButtons("up")
    const downs = moveButtons("down")
    expect(ups[0].disabled).toBe(true)
    expect(ups[1].disabled).toBe(false)
    expect(downs[downs.length - 1].disabled).toBe(true)
  })
})
