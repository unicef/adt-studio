// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PublicationSummary, PublicationsOverview } from "@adt/types"

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

vi.mock("@lingui/core/macro", () => {
  function templateToString(strings: TemplateStringsArray, ...values: unknown[]) {
    return strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
      "",
    )
  }
  return {
    msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      id: templateToString(strings, ...values),
    }),
  }
})

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a
      href={to}
      data-to={to}
      data-params={params ? JSON.stringify(params) : undefined}
      {...rest}
    >
      {children}
    </a>
  ),
}))

const getPublications = vi.fn()
const revokeBookPublication = vi.fn()
const resumeBookPublication = vi.fn()
const getPublicationReaders = vi.fn()

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
    getPublications,
    revokeBookPublication,
    resumeBookPublication,
    getPublicationReaders,
  },
  ApiError: MockApiError,
  apiErrorCode: (error: unknown) => (error instanceof MockApiError ? error.code : null),
  getBookCoverUrl: (label: string) => `/books/${label}/cover`,
}))

const { PublicationsDashboard } = await import("./PublicationsDashboard")

function summary(overrides: Partial<PublicationSummary> = {}): PublicationSummary {
  return {
    token: "TokenRavenTokenRavenTokenRaven12",
    title: "Raven and the Sun",
    book_label: "raven",
    book_exists: true,
    url: "https://adt-publish.escola.workers.dev/p/TokenRavenTokenRavenTokenRaven12/",
    current_version: 2,
    version_count: 2,
    created_at: "2026-08-01T09:00:00.000Z",
    last_published_at: "2026-08-04T09:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    has_access_code: true,
    access_code: "TURMA3B",
    comment_count: 5,
    unresolved_count: 3,
    snapshot_bytes: 8 * 1024 * 1024,
    source: "worker",
    ...overrides,
  }
}

function overview(overrides: Partial<PublicationsOverview> = {}): PublicationsOverview {
  const publications = overrides.publications ?? [summary()]
  const measured = publications.filter((entry) => entry.snapshot_bytes !== null)
  return {
    worker_reachable: true,
    publications,
    totals: {
      published_count: publications.length,
      active_count: publications.filter(
        (entry) => entry.revoked_at === null && entry.expires_at === null,
      ).length,
      total_snapshot_bytes: measured.reduce((total, entry) => total + (entry.snapshot_bytes ?? 0), 0),
      snapshot_bytes_complete: measured.length === publications.length,
      total_unresolved: publications.reduce((total, entry) => total + entry.unresolved_count, 0),
      ...overrides.totals,
    },
    ...overrides,
  }
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PublicationsDashboard />
    </QueryClientProvider>,
  )
}

const writeText = vi.fn()

beforeEach(() => {
  getPublications.mockResolvedValue(overview())
  revokeBookPublication.mockResolvedValue({ publication: {}, has_access_code: false })
  resumeBookPublication.mockResolvedValue({ publication: {}, has_access_code: false })
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PublicationsDashboard — not connected", () => {
  it("sends the author to the publishing settings instead of showing an empty shelf", async () => {
    getPublications.mockRejectedValue(
      new MockApiError("Connect a Cloudflare account", 412, "publish_not_connected"),
    )
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publications-not-connected")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("Connect a Cloudflare account to publish books")
    expect(screen.getByRole("link", { name: /set up publishing/i }).getAttribute("data-to")).toBe(
      "/settings",
    )
    expect(screen.queryByTestId("publications-empty")).toBeNull()
  })
})

describe("PublicationsDashboard — connected with nothing published", () => {
  it("encourages a first publish and hides the filter", async () => {
    getPublications.mockResolvedValue(overview({ publications: [] }))
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publications-empty")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("Nothing published yet")
    expect(screen.queryByRole("radiogroup")).toBeNull()
    /** No tiles either: "0 kB of 10 GB free" and "every link is live" are true and useless. */
    expect(document.body.textContent).not.toContain("Storage used")
    expect(document.body.textContent).not.toContain("free in R2")
  })
})

describe("PublicationsDashboard — populated", () => {
  it("lists a row per published book, newest first, with status, size and counts", async () => {
    getPublications.mockResolvedValue(
      overview({
        publications: [
          summary(),
          summary({
            token: "TokenOwlTokenOwlTokenOwlTokenOwl",
            title: "The Owl Who Counted",
            book_label: "owl",
            unresolved_count: 0,
            comment_count: 0,
            snapshot_bytes: 2 * 1024 * 1024,
            has_access_code: false,
          }),
        ],
      }),
    )
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain("Raven and the Sun")
    expect(rows[1]?.textContent).toContain("The Owl Who Counted")

    const raven = screen.getByTestId("publication-row-raven")
    expect(raven.getAttribute("data-state")).toBe("active")
    expect(raven.textContent).toContain("Live")
    /** The code itself, not just the fact of one: this screen is read out to a class. */
    expect(raven.textContent).toContain("TURMA3B")
    expect(screen.getByRole("button", { name: /access code TURMA3B/i })).toBeTruthy()
    expect(raven.textContent).toContain("8 MB")
    expect(raven.textContent).toContain("No end date")
    expect(raven.textContent).toContain("now serving v2")

    expect(screen.getByTestId("publication-row-owl").textContent).not.toContain("Code required")
  })

  it("totals the shelf and explains where the storage number comes from", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    expect(document.body.textContent).toContain("Storage used")
    expect(document.body.textContent).toContain("of 10 GB free in R2")
    expect(document.body.textContent).toContain(
      "How many people opened your links is not shown here",
    )
    expect(document.body.textContent).toContain("Comments to read")
  })

  it("says the storage total is only a floor when a size was never measured", async () => {
    getPublications.mockResolvedValue(
      overview({
        publications: [summary(), summary({ token: "T2", book_label: "owl", snapshot_bytes: null })],
      }),
    )
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publication-row-owl")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("at least")
  })

  it("links each row to that book's Feedback view, badged with its open count", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    const feedback = screen.getByRole("link", { name: /feedback/i })
    expect(feedback.getAttribute("data-to")).toBe("/books/$label/$step")
    expect(JSON.parse(feedback.getAttribute("data-params") as string)).toEqual({
      label: "raven",
      step: "feedback",
    })
    expect(feedback.textContent).toContain("3")

    const update = screen.getByRole("link", { name: /update site/i })
    expect(JSON.parse(update.getAttribute("data-params") as string)).toEqual({
      label: "raven",
      step: "export",
    })
  })

  it("copies the share link and announces it", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy the link to/i }))
    })

    expect(writeText).toHaveBeenCalledWith(
      "https://adt-publish.escola.workers.dev/p/TokenRavenTokenRavenTokenRaven12/",
    )
    const live = screen.getByRole("status")
    expect(live.getAttribute("aria-live")).toBe("polite")
    expect(live.textContent).toContain("Link copied to the clipboard.")
  })

  it("offers a manual fallback when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"))
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy the link to/i }))
    })

    expect(screen.getByRole("status").textContent).toContain("copy it by hand")
  })
})

describe("PublicationsDashboard — lifecycle states", () => {
  it("marks a stopped link and offers to resume it", async () => {
    getPublications.mockResolvedValue(
      overview({
        publications: [summary({ revoked_at: "2026-08-04T12:00:00.000Z" })],
      }),
    )
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })
    expect(screen.getByTestId("publication-row-raven").getAttribute("data-state")).toBe("revoked")
    expect(document.body.textContent).toContain("Sharing stopped")

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /resume sharing/i }))
    })
    expect(resumeBookPublication).toHaveBeenCalledWith("raven")
    expect(revokeBookPublication).not.toHaveBeenCalled()
  })

  it("marks an expired link without offering to resume it", async () => {
    getPublications.mockResolvedValue(
      overview({ publications: [summary({ expires_at: "2026-08-02T00:00:00.000Z" })] }),
    )
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })
    expect(screen.getByTestId("publication-row-raven").getAttribute("data-state")).toBe("expired")
    expect(document.body.textContent).toContain("Link expired")
    expect(screen.queryByRole("button", { name: /resume sharing/i })).toBeNull()
  })

  it("stops sharing a live link through the row action", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }))
    })
    expect(revokeBookPublication).toHaveBeenCalledWith("raven")
  })

  it("surfaces a failed stop instead of silently leaving the link live", async () => {
    revokeBookPublication.mockRejectedValue(new Error("Your worker refused"))
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }))
    })

    await waitFor(() => {
      expect(screen.getByTestId("publications-action-error").textContent).toContain(
        "Your worker refused",
      )
    })
  })
})

describe("PublicationsDashboard — a book that is no longer on this computer", () => {
  it("keeps the row, names the problem and disables every local action", async () => {
    getPublications.mockResolvedValue(
      overview({ publications: [summary({ book_exists: false, title: "Deleted Locally" })] }),
    )
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })
    const row = screen.getByTestId("publication-row-raven")
    expect(row.textContent).toContain("Deleted Locally")
    expect(row.textContent).toContain("Book no longer on this computer")

    /** The link itself is still live and still openable — only the local actions are gone. */
    expect(screen.getByRole("link", { name: /open/i })).toBeTruthy()
    expect(screen.queryByRole("link", { name: /feedback/i })).toBeNull()
    expect(
      within(row).getByRole("button", { name: /^feedback/i }).hasAttribute("disabled"),
    ).toBe(true)
    expect(screen.getByRole("button", { name: /stop sharing/i }).hasAttribute("disabled")).toBe(
      true,
    )
  })
})

describe("PublicationsDashboard — worker unreachable", () => {
  it("banners the degraded read, still lists the rows and refuses to invent counts", async () => {
    getPublications.mockResolvedValue({
      worker_reachable: false,
      publications: [
        summary({
          source: "local",
          comment_count: 0,
          unresolved_count: 0,
          snapshot_bytes: null,
        }),
      ],
      totals: {
        published_count: 1,
        active_count: 1,
        total_snapshot_bytes: 0,
        snapshot_bytes_complete: false,
        total_unresolved: 0,
      },
    } satisfies PublicationsOverview)
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publications-worker-unreachable")).toBeTruthy()
    })
    expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    expect(document.body.textContent).toContain("isn't answering")
    /** No "0 open comments" and no "0 kB": both would be claims nobody measured. */
    expect(document.body.textContent).not.toContain("Nothing open")
    expect(document.body.textContent).not.toContain("free in R2")
  })

  it("retries on demand", async () => {
    getPublications.mockResolvedValue({
      worker_reachable: false,
      publications: [summary({ source: "local", snapshot_bytes: null })],
      totals: {
        published_count: 1,
        active_count: 1,
        total_snapshot_bytes: 0,
        snapshot_bytes_complete: false,
        total_unresolved: 0,
      },
    } satisfies PublicationsOverview)
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publications-worker-unreachable")).toBeTruthy()
    })
    getPublications.mockResolvedValue(overview())

    await act(async () => {
      fireEvent.click(
        screen.getByTestId("publications-worker-unreachable").querySelector("button") as Element,
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId("publications-worker-unreachable")).toBeNull()
    })
  })
})

describe("PublicationsDashboard — filtering", () => {
  it("filters to live and to not-shared links, and offers a way back", async () => {
    getPublications.mockResolvedValue(
      overview({
        publications: [
          summary(),
          summary({
            token: "T2",
            book_label: "owl",
            title: "The Owl Who Counted",
            revoked_at: "2026-08-03T00:00:00.000Z",
          }),
        ],
      }),
    )
    renderDashboard()

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2)
    })

    fireEvent.click(screen.getByRole("radio", { name: /^live$/i }))
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })
    expect(screen.queryByTestId("publication-row-owl")).toBeNull()

    fireEvent.click(screen.getByRole("radio", { name: /not shared/i }))
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-owl")).toBeTruthy()
    })
    expect(screen.queryByTestId("publication-row-raven")).toBeNull()
  })

  it("explains an empty filter rather than showing a blank list", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("radio", { name: /not shared/i }))
    await waitFor(() => {
      expect(screen.getByTestId("publications-filter-empty")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("Every one of your links is live.")

    fireEvent.click(screen.getByRole("button", { name: /clear the filters/i }))
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })
  })
})

describe("PublicationsDashboard — searching and sorting", () => {
  function shelf() {
    return overview({
      publications: [
        summary({ title: "Raven and the Sun", unresolved_count: 3, snapshot_bytes: 8_000_000 }),
        summary({
          token: "TokenOwlTokenOwlTokenOwlToken123",
          book_label: "owl",
          title: "The Owl Who Counted",
          last_published_at: "2026-08-05T09:00:00.000Z",
          unresolved_count: 0,
          snapshot_bytes: 40_000_000,
        }),
        summary({
          token: "TokenFoxTokenFoxTokenFoxToken123",
          book_label: "fox",
          title: "A Fox in the Field",
          last_published_at: "2026-07-01T09:00:00.000Z",
          unresolved_count: 9,
          snapshot_bytes: 1_000_000,
        }),
      ],
    })
  }

  function titlesInOrder(): string[] {
    return screen
      .getAllByRole("listitem")
      .map((row) => row.getAttribute("data-testid") ?? "")
      .filter((testid) => testid.startsWith("publication-row-"))
  }

  it("narrows the shelf by title and says so when nothing matches", async () => {
    getPublications.mockResolvedValue(shelf())
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    fireEvent.change(screen.getByRole("searchbox", { name: /search published books/i }), {
      target: { value: "owl" },
    })
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })
    expect(screen.getByTestId("publication-row-owl")).toBeTruthy()

    fireEvent.change(screen.getByRole("searchbox", { name: /search published books/i }), {
      target: { value: "penguin" },
    })
    await waitFor(() => {
      expect(screen.getByTestId("publications-filter-empty")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("penguin")
  })

  /** The default order is what the author published most recently, not what the API happened
   *  to hand back — a book updated today has to be reachable without scrolling. */
  it("orders by last published, and re-orders on demand", async () => {
    getPublications.mockResolvedValue(shelf())
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })
    expect(titlesInOrder()).toEqual([
      "publication-row-owl",
      "publication-row-raven",
      "publication-row-fox",
    ])

    fireEvent.click(screen.getByRole("button", { name: /only with open feedback/i }))
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2)
    })
    expect(screen.queryByTestId("publication-row-owl")).toBeNull()
  })
})

describe("PublicationsDashboard — readers", () => {
  it("asks the worker only once the author opens the panel, and never claims silent readers", async () => {
    getPublications.mockResolvedValue(overview())
    getPublicationReaders.mockResolvedValue({
      readers: [
        {
          id: "s1",
          name: "Ana",
          color: "#0091ff",
          joined_at: "2026-08-02T10:00:00.000Z",
          comment_count: 4,
          last_comment_at: "2026-08-03T10:00:00.000Z",
        },
      ],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })
    expect(getPublicationReaders).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /readers/i }))
    await waitFor(() => {
      expect(document.body.textContent).toContain("Ana")
    })
    expect(getPublicationReaders).toHaveBeenCalledWith("TokenRavenTokenRavenTokenRaven12")
    expect(document.body.textContent).toContain("Only people who typed a name are listed")
  })

  it("points at the update instead of claiming the publication is gone", async () => {
    getPublications.mockResolvedValue(overview())
    getPublicationReaders.mockRejectedValue(
      new MockApiError("Your publishing service is older", 409, "worker_outdated"),
    )
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /readers/i }))
    await waitFor(() => {
      expect(screen.getByTestId("publication-readers-outdated")).toBeTruthy()
    })
    expect(document.body.textContent).not.toContain("not in this account")
    expect(screen.getByRole("link", { name: /install the update/i })).toBeTruthy()
  })

  it("says nobody has given a name rather than showing an empty list", async () => {
    getPublications.mockResolvedValue(overview())
    getPublicationReaders.mockResolvedValue({ readers: [] })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /readers/i }))
    await waitFor(() => {
      expect(document.body.textContent).toContain("Nobody has given a name yet")
    })
  })
})

describe("PublicationsDashboard — the list itself cannot be read", () => {
  it("offers a retry for an unexpected failure", async () => {
    getPublications.mockRejectedValue(new MockApiError("Boom", 500, "internal_error"))
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publications-load-error")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("We couldn't load your published books")

    getPublications.mockResolvedValue(overview())
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    })

    await waitFor(() => {
      expect(screen.getByTestId("publication-row-raven")).toBeTruthy()
    })
  })
})
