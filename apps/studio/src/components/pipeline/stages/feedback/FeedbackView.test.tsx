// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type {
  BookPublicationStatus,
  PublicationPageManifest,
  PublishComment,
  PublishCommentListResponse,
} from "@/api/client"

vi.mock("@lingui/react/macro", () => {
  function templateToString(strings: TemplateStringsArray, ...values: unknown[]) {
    return strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
      "",
    )
  }
  return {
    Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useLingui: () => ({
      t: templateToString,
      i18n: { _: (descriptor: { id?: string }) => descriptor?.id ?? "", locale: "en" },
    }),
  }
})

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    i18n: { _: (descriptor: { id?: string }) => descriptor?.id ?? "", locale: "en" },
  }),
}))

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    id: strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
      "",
    ),
  }),
}))

const navigateMock = vi.fn()
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}))

vi.mock("@/components/pipeline/components/StepViewRouter", () => ({
  useStepHeader: () => ({ headerSlotEl: null, setExtra: () => {}, setOnLabelClick: () => {} }),
}))

const getBookPublication = vi.fn()
const getPublicationComments = vi.fn()
const getPublicationPages = vi.fn()
const createPublicationComment = vi.fn()
const resolvePublicationComment = vi.fn()
const updatePublicationComment = vi.fn()
const deletePublicationComment = vi.fn()

class MockApiError extends Error {
  readonly status: number
  readonly code: string | null
  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

vi.mock("@/api/client", () => ({
  api: {
    getBookPublication,
    getPublicationComments,
    getPublicationPages,
    createPublicationComment,
    resolvePublicationComment,
    updatePublicationComment,
    deletePublicationComment,
  },
  ApiError: MockApiError,
  apiErrorCode: (error: unknown) => (error instanceof MockApiError ? error.code : null),
  getPublicationPreviewUrl: (label: string, file = "") =>
    `/api/books/${label}/publication/preview/${file}`,
}))

const { FeedbackView } = await import("./FeedbackView")

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345"
const LABEL = "raven"
const AUTHOR_SESSION = `author-${TOKEN}`

function publishedStatus(overrides: Partial<BookPublicationStatus> = {}): BookPublicationStatus {
  return {
    connected: true,
    worker_reachable: true,
    has_access_code: true,
    url: `https://adt-publish.example.workers.dev/p/${TOKEN}/`,
    publication: {
      token: TOKEN,
      title: "Raven and the Sun",
      book_label: LABEL,
      current_version: 2,
      created_at: "2026-08-01T10:00:00.000Z",
      expires_at: null,
      revoked_at: null,
    },
    record: {
      token: TOKEN,
      base_url: `https://adt-publish.example.workers.dev/p/${TOKEN}/`,
      worker_url: "https://adt-publish.example.workers.dev",
      created_at: "2026-08-01T10:00:00.000Z",
      expires_at: null,
      revoked_at: null,
      versions: [
        { version: 1, published_at: "2026-08-01T10:00:00.000Z", page_count: 2 },
        { version: 2, published_at: "2026-08-02T10:00:00.000Z", page_count: 2 },
      ],
      access_code: "K7RM2P",
      has_access_code: true,
    },
    ...overrides,
  }
}

function neverPublished(): BookPublicationStatus {
  return {
    connected: true,
    worker_reachable: true,
    has_access_code: false,
    url: null,
    publication: null,
    record: null,
  }
}

const PAGES: PublicationPageManifest = {
  current_version: 2,
  pages: [
    { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
    { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
  ],
}

function comment(overrides: Partial<PublishComment> & { id: string }): PublishComment {
  return {
    token: TOKEN,
    version: 2,
    page_section_id: "pg001_sec001",
    parent_id: null,
    session_id: "session-maria",
    author_name: "Maria",
    author_color: "#e5484d",
    body: "This sentence is hard for the kids",
    anchor: { selector: '#content [data-id="a"]', xOffsetPct: 50, yOffsetPct: 50 },
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T10:00:00.000Z",
    ...overrides,
  }
}

function commentList(comments: PublishComment[]): PublishCommentListResponse {
  return {
    comments,
    session: { id: AUTHOR_SESSION, name: "Author", color: "#8d8d8d", is_author: true },
  }
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <FeedbackView bookLabel={LABEL} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  window.localStorage.clear()
  getBookPublication.mockResolvedValue(publishedStatus())
  getPublicationPages.mockResolvedValue(PAGES)
  getPublicationComments.mockResolvedValue(commentList([comment({ id: "c1" })]))
  createPublicationComment.mockImplementation((_label, body) =>
    Promise.resolve({
      comment: comment({
        id: "reply-1",
        parent_id: String(body.parentId),
        session_id: AUTHOR_SESSION,
        author_name: "Eliezir",
        body: String(body.body),
        anchor: null,
      }),
    }),
  )
  resolvePublicationComment.mockImplementation((_label, id, resolved) =>
    Promise.resolve({
      comment: comment({
        id: String(id),
        resolved_at: resolved ? "2026-08-04T13:00:00.000Z" : null,
      }),
    }),
  )
  updatePublicationComment.mockImplementation((_label, id, body) =>
    Promise.resolve({ comment: comment({ id: String(id), body: String(body) }) }),
  )
  deletePublicationComment.mockImplementation((_label, id) =>
    Promise.resolve({
      comment: comment({ id: String(id), deleted_at: "2026-08-04T13:00:00.000Z" }),
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("FeedbackView — states", () => {
  it("points a never-published book at Share online and asks the worker for nothing", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    renderView()

    await screen.findByText("No feedback yet — this book has not been shared")
    expect(getPublicationComments).not.toHaveBeenCalled()
    expect(getPublicationPages).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("Go to Share online"))
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ params: { label: LABEL, step: "export" } }),
    )
  })

  it("asks for a Cloudflare connection when there is none", async () => {
    getBookPublication.mockResolvedValue(publishedStatus({ connected: false }))
    renderView()
    await screen.findByText("Connect your Cloudflare account to read this feedback")
    expect(getPublicationComments).not.toHaveBeenCalled()
  })

  it("encourages sharing when the publication has no comments yet", async () => {
    getPublicationComments.mockResolvedValue(commentList([]))
    renderView()
    await screen.findByText("Get the share link")
    expect(screen.getByText("None yet")).toBeTruthy()
  })

  it("shows an offline banner instead of pretending the list is current", async () => {
    getBookPublication.mockResolvedValue(publishedStatus({ worker_reachable: false }))
    getPublicationComments.mockRejectedValue(new MockApiError("down", 502, "worker_unreachable"))
    renderView()
    await screen.findByText(
      "Your publish worker cannot be reached, so this is not showing current feedback.",
    )
    expect(await screen.findByText("Feedback could not be loaded.")).toBeTruthy()
    expect(screen.queryByText("All resolved")).toBeNull()
    expect(screen.queryByText("Get the share link")).toBeNull()
  })


  it("says the link is off on a revoked publication and still lists the feedback", async () => {
    const status = publishedStatus()
    getBookPublication.mockResolvedValue({
      ...status,
      publication: { ...status.publication!, revoked_at: "2026-08-03T10:00:00.000Z" },
      record: { ...status.record!, revoked_at: "2026-08-03T10:00:00.000Z" },
    })
    renderView()
    await screen.findByText(/This link is off/)
    expect(await screen.findByText("This sentence is hard for the kids")).toBeTruthy()
  })
})

describe("FeedbackView — threads panel", () => {
  it("groups threads by page and counts what is open", async () => {
    getPublicationComments.mockResolvedValue(
      commentList([
        comment({ id: "c1" }),
        comment({ id: "c2", page_section_id: "pg002_sec001", body: "Second page note" }),
      ]),
    )
    renderView()

    await screen.findByText("Page 1")
    expect(screen.getByText("Page 2")).toBeTruthy()
    expect(screen.getByText("2 open")).toBeTruthy()
  })

  it("hides resolved threads until All is chosen", async () => {
    getPublicationComments.mockResolvedValue(
      commentList([
        comment({ id: "c1" }),
        comment({
          id: "c2",
          body: "Already handled",
          resolved_at: "2026-08-04T11:00:00.000Z",
        }),
      ]),
    )
    renderView()

    await screen.findByText("This sentence is hard for the kids")
    expect(screen.queryByText("Already handled")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "All" }))
    expect(await screen.findByText("Already handled")).toBeTruthy()
    expect(screen.getByText("1 open")).toBeTruthy()
  })

  it("marks a thread written on an older version with a version chip", async () => {
    getPublicationComments.mockResolvedValue(
      commentList([comment({ id: "c1", version: 1 })]),
    )
    renderView()
    expect(await screen.findByText("v1")).toBeTruthy()
  })

  it("labels a whole-page comment instead of promising a pin", async () => {
    getPublicationComments.mockResolvedValue(
      commentList([comment({ id: "c1", anchor: null })]),
    )
    renderView()
    expect(await screen.findByText("Whole page")).toBeTruthy()
  })

  it("shows a deleted reviewer comment as a placeholder", async () => {
    getPublicationComments.mockResolvedValue(
      commentList([comment({ id: "c1", deleted_at: "2026-08-04T11:00:00.000Z" })]),
    )
    renderView()
    expect(await screen.findByText("This comment was deleted")).toBeTruthy()
  })

  it("expands a thread on click and reports it to assistive tech", async () => {
    renderView()
    const row = await screen.findByRole("button", { expanded: false })
    fireEvent.click(row)
    await waitFor(() => {
      expect(row.getAttribute("aria-expanded")).toBe("true")
    })
    expect(screen.getByLabelText("Reply to this thread")).toBeTruthy()
  })
})

describe("FeedbackView — author powers", () => {
  async function openThread(): Promise<void> {
    const row = await screen.findByRole("button", { expanded: false })
    fireEvent.click(row)
    await screen.findByLabelText("Reply to this thread")
  }

  it("resolves a thread and announces it", async () => {
    renderView()
    await openThread()

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }))
    await waitFor(() => {
      expect(resolvePublicationComment).toHaveBeenCalledWith(LABEL, "c1", true, null)
    })
    expect(await screen.findByText("Thread resolved")).toBeTruthy()
  })

  it("reopens a resolved thread — the only place in the product that can", async () => {
    getPublicationComments.mockResolvedValue(
      commentList([comment({ id: "c1", resolved_at: "2026-08-04T11:00:00.000Z" })]),
    )
    renderView()
    fireEvent.click(await screen.findByRole("button", { name: "All" }))
    await openThread()

    fireEvent.click(screen.getByRole("button", { name: "Reopen" }))
    await waitFor(() => {
      expect(resolvePublicationComment).toHaveBeenCalledWith(LABEL, "c1", false, null)
    })
    expect(await screen.findByText("Thread reopened")).toBeTruthy()
  })

  it("posts a reply with no author name until one is chosen", async () => {
    renderView()
    await openThread()

    fireEvent.change(screen.getByLabelText("Reply to this thread"), {
      target: { value: "Rewritten in the next version" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Reply" }))

    await waitFor(() => {
      expect(createPublicationComment).toHaveBeenCalledWith(
        LABEL,
        {
          parentId: "c1",
          pageSectionId: "pg001_sec001",
          body: "Rewritten in the next version",
        },
        null,
      )
    })
    expect(await screen.findByText("Reply posted as Author")).toBeTruthy()
  })

  it("sends the chosen author name on the next write and remembers it", async () => {
    renderView()
    await screen.findByText("This sentence is hard for the kids")

    fireEvent.click(screen.getByRole("button", { name: "change" }))
    fireEvent.change(screen.getByLabelText("Your name on replies"), {
      target: { value: "Eliezir" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(window.localStorage.getItem("adt-studio-publish-author-name")).toBe("Eliezir")
    expect(await screen.findByText("Eliezir")).toBeTruthy()

    await openThread()
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }))
    await waitFor(() => {
      expect(resolvePublicationComment).toHaveBeenCalledWith(LABEL, "c1", true, "Eliezir")
    })
  })

  it("offers edit and delete on the author's own comment only", async () => {
    getPublicationComments.mockResolvedValue(
      commentList([
        comment({ id: "c1" }),
        comment({
          id: "c2",
          parent_id: "c1",
          session_id: AUTHOR_SESSION,
          author_name: "Author",
          author_color: "#8d8d8d",
          body: "Fixed in the next update",
          anchor: null,
          created_at: "2026-08-04T11:00:00.000Z",
        }),
      ]),
    )
    renderView()
    await openThread()

    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.change(screen.getByLabelText("Edit your comment"), {
      target: { value: "Fixed in v3" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(updatePublicationComment).toHaveBeenCalledWith(LABEL, "c2", "Fixed in v3", null)
    })
    expect(await screen.findByText("Comment updated")).toBeTruthy()
  })

  it("asks before deleting the author's own comment", async () => {
    getPublicationComments.mockResolvedValue(
      commentList([
        comment({
          id: "c1",
          session_id: AUTHOR_SESSION,
          author_name: "Author",
        }),
      ]),
    )
    renderView()
    await openThread()

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(screen.getByText("Delete this comment?")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => {
      expect(deletePublicationComment).toHaveBeenCalledWith(LABEL, "c1", null)
    })
    expect(await screen.findByText("Comment deleted")).toBeTruthy()
  })

  it("refetches on demand rather than polling", async () => {
    renderView()
    await screen.findByText("This sentence is hard for the kids")
    const calls = getPublicationComments.mock.calls.length

    fireEvent.click(screen.getByRole("button", { name: "Check for new feedback" }))
    await waitFor(() => {
      expect(getPublicationComments.mock.calls.length).toBeGreaterThan(calls)
    })
  })

  it("surfaces a rejected write instead of swallowing it", async () => {
    resolvePublicationComment.mockRejectedValue(
      new MockApiError("That thread is already gone", 404, "not_found"),
    )
    renderView()
    await openThread()
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }))
    expect(await screen.findByText("That thread is already gone")).toBeTruthy()
  })
})
