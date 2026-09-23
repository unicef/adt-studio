// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PublicationSummary, PublicationsOverview } from "@adt/types"
import { toast } from "@/components/ui/sonner"

vi.mock("@lingui/react/macro", () => {
  function templateToString(strings: TemplateStringsArray, ...values: unknown[]) {
    return strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
      "",
    )
  }
  return {
    Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Plural: ({ value, one, other }: { value: number; one: string; other: string }) => (
      <>{(value === 1 ? one : other).replace("#", String(value))}</>
    ),
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

const navigate = vi.fn()

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
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

vi.mock("@/components/ui/sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const getPublications = vi.fn()
const revokeBookPublication = vi.fn()
const resumeBookPublication = vi.fn()
const getPublicationReaders = vi.fn()
const deletePublication = vi.fn()
const publishBookVersion = vi.fn()

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
    deletePublication,
    publishBookVersion,
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
    version_count: 3,
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

/** Stop/resume/delete/readers/comments all moved behind one "More actions" menu when the shelf
 *  became a grid of cards, so every row action now costs a menu open. Radix opens on
 *  pointerdown, not click. */
function openCardMenu(label = "raven") {
  const card = screen.getByTestId(`publication-card-${label}`)
  fireEvent.pointerDown(within(card).getByRole("button", { name: /more actions for/i }), {
    button: 0,
    ctrlKey: false,
  })
  return screen.getByRole("menu")
}

function clickMenuItem(name: RegExp, label = "raven") {
  fireEvent.click(within(openCardMenu(label)).getByRole("menuitem", { name }))
}

/** Selecting an item that fires a mutation: the menu has to be opened before the `act` scope,
 *  because React does not flush the open until the scope ends. */
async function selectMenuItem(name: RegExp, label = "raven") {
  const item = within(openCardMenu(label)).getByRole("menuitem", { name })
  await act(async () => {
    fireEvent.click(item)
  })
}

beforeEach(() => {
  getPublications.mockResolvedValue(overview())
  revokeBookPublication.mockResolvedValue({ publication: {}, has_access_code: false })
  resumeBookPublication.mockResolvedValue({ publication: {}, has_access_code: false })
  deletePublication.mockResolvedValue({ token: "t", deleted: true, objects_deleted: 3 })
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
    expect(document.body.textContent).toContain("Connect a Cloudflare account to share books")
    expect(screen.getByRole("link", { name: /set up sharing/i }).getAttribute("data-to")).toBe(
      "/settings",
    )
    expect(screen.queryByTestId("publications-empty")).toBeNull()
  })
})

describe("PublicationsDashboard — connected with nothing published", () => {
  it("keeps the dashboard it will grow into, and hides the filter", async () => {
    getPublications.mockResolvedValue(overview({ publications: [] }))
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publications-empty")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("No shared books yet")
    /** Filtering nothing is noise, so the controls wait until there is a shelf to filter. */
    expect(screen.queryByRole("radiogroup")).toBeNull()

    /** The tiles keep their place so the screen does not rearrange around the first share,
     *  but they hold a dash: "0 kB used" and "every link is live" are true and say nothing. */
    expect(document.body.textContent).toContain("Storage used")
    expect(document.body.textContent).toContain("Comments to read")
    expect(document.body.textContent).not.toContain("Every link is live")
    expect(document.body.textContent).not.toContain("Nothing open")
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
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain("Raven and the Sun")
    expect(rows[1]?.textContent).toContain("The Owl Who Counted")

    const raven = screen.getByTestId("publication-card-raven")
    expect(raven.getAttribute("data-state")).toBe("active")
    expect(raven.textContent).toContain("Live")
    expect(raven.textContent).toContain("8 MB")
    /** The badge is the version readers are being served, not the number of versions kept. */
    expect(raven.textContent).toContain("v2")
    expect(within(raven).getByText(/now serving version 2 of 3/i)).toBeTruthy()

    /** The card face says a code exists; the code itself is one menu away, because this screen
     *  gets read out to a class with the rest of the room looking at it. */
    expect(within(raven).getByText(/readers need an access code/i)).toBeTruthy()
    expect(raven.textContent).not.toContain("TURMA3B")
    expect(
      within(openCardMenu()).getByRole("menuitem", { name: /copy code TURMA3B/i }),
    ).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })

    const owl = screen.getByTestId("publication-card-owl")
    expect(within(owl).queryByText(/readers need an access code/i)).toBeNull()
  })

  it("totals the shelf and explains where the storage number comes from", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    expect(document.body.textContent).toContain("Storage used")
    expect(document.body.textContent).toContain("Across all shared versions")
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
      expect(screen.getByTestId("publication-card-owl")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("at least")
  })

  it("links each row to that book's comments in the Storyboard, badged with its open count", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    /** The count of threads waiting is on the card face — it is the reason to come back to
     *  this screen at all, so it cannot be hidden behind a menu. */
    const raven = screen.getByTestId("publication-card-raven")
    expect(within(raven).getByText("3")).toBeTruthy()
    expect(within(raven).getByText(/comments waiting for you/i)).toBeTruthy()

    clickMenuItem(/^comments/i)
    expect(navigate).toHaveBeenCalledWith({
      to: "/books/$label/$step",
      params: { label: "raven", step: "storyboard" },
    })

    /** Publishing, not Export. These were the same screen until publishing became its own
     *  stage and Export was cut back to a pointer at it, and this assertion happily agreed with
     *  the stale destination — so it is spelled out here rather than left as a bare string. */
    clickMenuItem(/update site/i)
    expect(navigate).toHaveBeenLastCalledWith({
      to: "/books/$label/$step",
      params: { label: "raven", step: "publish" },
    })
  })

  it("copies the share link and announces it", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy the link to/i }))
    })

    expect(writeText).toHaveBeenCalledWith(
      "https://adt-publish.escola.workers.dev/p/TokenRavenTokenRavenTokenRaven12/",
    )
    expect(toast.success).toHaveBeenCalledWith("Link copied to the clipboard")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("offers a manual fallback when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"))
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy the link to/i }))
    })

    /** A button that silently does nothing teaches the author that sharing is broken, so the
     *  refusal is said out loud and points at the one place the link can still be copied. */
    expect(toast.success).not.toHaveBeenCalled()
    expect(String(toast.error.mock.calls[0]?.[0])).toContain("Sharing step")
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
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })
    expect(screen.getByTestId("publication-card-raven").getAttribute("data-state")).toBe("revoked")
    expect(screen.getByTestId("publication-card-raven").textContent).toContain("Stopped")

    await selectMenuItem(/resume sharing/i)
    expect(resumeBookPublication).toHaveBeenCalledWith("raven")
    expect(revokeBookPublication).not.toHaveBeenCalled()
  })

  it("marks an expired link without offering to resume it", async () => {
    getPublications.mockResolvedValue(
      overview({ publications: [summary({ expires_at: "2026-08-02T00:00:00.000Z" })] }),
    )
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })
    expect(screen.getByTestId("publication-card-raven").getAttribute("data-state")).toBe("expired")
    expect(screen.getByTestId("publication-card-raven").textContent).toContain("Expired")
    /** An expired link cannot be resumed by flipping a switch — it needs a fresh publish — so
     *  the menu must not offer it. */
    expect(within(openCardMenu()).queryByRole("menuitem", { name: /resume sharing/i })).toBeNull()
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: /stop sharing/i }))
      .toBeTruthy()
  })

  it("stops sharing a live link through the row action", async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    await selectMenuItem(/stop sharing/i)
    expect(revokeBookPublication).toHaveBeenCalledWith("raven")
  })

  it("surfaces a failed stop instead of silently leaving the link live", async () => {
    revokeBookPublication.mockRejectedValue(new Error("Your worker refused"))
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    await selectMenuItem(/stop sharing/i)

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
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })
    const row = screen.getByTestId("publication-card-raven")
    expect(row.textContent).toContain("Deleted Locally")
    /** On the card itself, not only inside the menu: it is the reason every action below is
     *  greyed out, and an author who never opens the menu still has to learn it. */
    expect(row.textContent).toContain("Book no longer on this computer")

    /** The link itself is still live and still openable — only the local actions are gone. */
    expect(within(row).getByRole("link", { name: /^open /i })).toBeTruthy()

    const menu = openCardMenu()
    expect(menu.textContent).toContain("This book is not on this computer.")
    for (const name of [/^comments/i, /update site/i]) {
      expect(
        within(menu).getByRole("menuitem", { name }).getAttribute("aria-disabled"),
      ).toBe("true")
    }
    /** Stopping is a call to Cloudflare, not to this computer, so it stays available: the
     *  author must be able to pull a live link down for a book they no longer hold. */
    expect(
      within(menu).getByRole("menuitem", { name: /stop sharing/i }).getAttribute("aria-disabled"),
    ).not.toBe("true")
  })

  it("still lets the author erase it — the only way that row can ever leave the shelf", async () => {
    getPublications.mockResolvedValue(
      overview({ publications: [summary({ book_exists: false, title: "Deleted Locally" })] }),
    )
    renderDashboard()

    await screen.findByTestId("publication-card-raven")

    /** Erasing is irreversible and takes the feedback with it, so it asks first. A menu closes
     *  on select, so the question cannot grow in place the way the old row's did — it gets its
     *  own dialog, and choosing the menu item must not be the act of deleting. */
    clickMenuItem(/delete permanently/i)
    expect(deletePublication).not.toHaveBeenCalled()

    const confirm = await screen.findByTestId("publication-delete-confirm")
    expect(confirm.textContent).toContain("Deleted Locally")
    expect(confirm.textContent).toContain("stops working for everyone")

    fireEvent.click(within(confirm).getByRole("button", { name: /delete permanently/i }))
    await waitFor(() => {
      expect(deletePublication).toHaveBeenCalledWith("TokenRavenTokenRavenTokenRaven12")
    })
  })

  it("keeps the row when erasing fails, and says why", async () => {
    getPublications.mockResolvedValue(
      overview({ publications: [summary({ book_exists: false })] }),
    )
    deletePublication.mockRejectedValue(new Error("Your publishing service didn't answer"))
    renderDashboard()

    await screen.findByTestId("publication-card-raven")
    clickMenuItem(/delete permanently/i)
    fireEvent.click(
      within(await screen.findByTestId("publication-delete-confirm")).getByRole("button", {
        name: /delete permanently/i,
      }),
    )

    /** In the row, not under the list: a shelf runs long enough that a single alert at the
     *  bottom is below the fold by the time the answer arrives. */
    await waitFor(() => {
      expect(screen.getByTestId("publication-delete-error-raven").textContent).toContain(
        "didn't answer",
      )
    })
    expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    expect(screen.queryByTestId("publications-action-error")).toBeNull()
  })

  /** The failure the author is most likely to hit, and the only one with a cure they can act
   *  on: the service in their own account predates the route, so the row offers the update. */
  it("offers the update when the publishing service is too old to erase", async () => {
    getPublications.mockResolvedValue(
      overview({ publications: [summary({ book_exists: false })] }),
    )
    deletePublication.mockRejectedValue(
      new MockApiError("Your publishing service is older than this Studio", 409, "worker_outdated"),
    )
    renderDashboard()

    await screen.findByTestId("publication-card-raven")
    clickMenuItem(/delete permanently/i)
    fireEvent.click(
      within(await screen.findByTestId("publication-delete-confirm")).getByRole("button", {
        name: /delete permanently/i,
      }),
    )

    const failure = await screen.findByTestId("publication-delete-error-raven")
    expect(failure.textContent).toContain("Nothing was deleted")
    expect(within(failure).getByRole("link", { name: /install the update/i })).toBeTruthy()
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
    expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
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
  /** There is no all/live/not-shared switch: a shelf of tens is read whole, and the lifecycle
   *  of each link is already a pill on its card. The one filter left is the one that answers a
   *  question the card grid cannot — "what is waiting for me". */
  it("offers no lifecycle tabs, only the question the cards cannot answer", async () => {
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
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.queryByRole("radio", { name: /^live$/i })).toBeNull()
    expect(screen.queryByRole("radio", { name: /not shared/i })).toBeNull()
    /** Both are still listed and still tell their state apart without the tabs. */
    expect(screen.getByTestId("publication-card-raven").getAttribute("data-state")).toBe("active")
    expect(screen.getByTestId("publication-card-owl").getAttribute("data-state")).toBe("revoked")
  })

  it("explains an empty filter rather than showing a blank list", async () => {
    getPublications.mockResolvedValue(
      overview({ publications: [summary({ unresolved_count: 0, comment_count: 0 })] }),
    )
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /only with open feedback/i }))
    await waitFor(() => {
      expect(screen.getByTestId("publications-filter-empty")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("every thread is resolved")

    fireEvent.click(screen.getByRole("button", { name: /clear the filters/i }))
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
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
      .filter((testid) => testid.startsWith("publication-card-"))
  }

  it("narrows the shelf by title and says so when nothing matches", async () => {
    getPublications.mockResolvedValue(shelf())
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    fireEvent.change(screen.getByRole("searchbox", { name: /search shared books/i }), {
      target: { value: "owl" },
    })
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })
    expect(screen.getByTestId("publication-card-owl")).toBeTruthy()

    fireEvent.change(screen.getByRole("searchbox", { name: /search shared books/i }), {
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
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })
    expect(titlesInOrder()).toEqual([
      "publication-card-owl",
      "publication-card-raven",
      "publication-card-fox",
    ])

    fireEvent.click(screen.getByRole("button", { name: /only with open feedback/i }))
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2)
    })
    expect(screen.queryByTestId("publication-card-owl")).toBeNull()
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
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })
    expect(getPublicationReaders).not.toHaveBeenCalled()

    clickMenuItem(/readers/i)
    const panel = await screen.findByRole("dialog")
    await waitFor(() => {
      expect(panel.textContent).toContain("Ana")
    })
    expect(getPublicationReaders).toHaveBeenCalledWith("TokenRavenTokenRavenTokenRaven12")
    expect(panel.textContent).toContain("Only people who typed a name are listed")

    /** A dialog rather than a drawer inside the card: on a grid, expanding one card in place
     *  reflows every card after it. Re-opening must not re-ask the worker. */
    fireEvent.keyDown(panel, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })

    clickMenuItem(/readers/i)
    await screen.findByRole("dialog")
    expect(getPublicationReaders).toHaveBeenCalledTimes(1)
  })

  it("points at the update instead of claiming the publication is gone", async () => {
    getPublications.mockResolvedValue(overview())
    getPublicationReaders.mockRejectedValue(
      new MockApiError("Your publishing service is older", 409, "worker_outdated"),
    )
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    clickMenuItem(/readers/i)
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
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })

    clickMenuItem(/readers/i)
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
    expect(document.body.textContent).toContain("We couldn't load your shared books")

    getPublications.mockResolvedValue(overview())
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    })

    await waitFor(() => {
      expect(screen.getByTestId("publication-card-raven")).toBeTruthy()
    })
  })
})

describe("PublicationsDashboard — links on an older reader", () => {
  function twoOutdated() {
    return overview({
      publications: [
        summary({ host_update_available: true, host_version: "0.12.0" }),
        summary({
          token: "TokenOwlTokenOwlTokenOwlToken123",
          book_label: "owl",
          title: "The Owl Who Counted",
          host_update_available: true,
          host_version: null,
        }),
        summary({
          token: "TokenFoxTokenFoxTokenFoxToken123",
          book_label: "fox",
          title: "A Fox in the Field",
          host_update_available: false,
          host_version: "0.13.1",
        }),
      ],
    })
  }

  it("says how many links run an older reader, and marks each of them", async () => {
    getPublications.mockResolvedValue(twoOutdated())
    renderDashboard()

    const banner = await screen.findByTestId("host-updates-banner")
    expect(banner.textContent).toContain("2 shared books run an older reader")
    expect(within(screen.getByTestId("publication-card-raven")).getByText("A newer reader is ready")).toBeTruthy()
    expect(within(screen.getByTestId("publication-card-owl")).getByText("A newer reader is ready")).toBeTruthy()
    expect(within(screen.getByTestId("publication-card-fox")).queryByText("A newer reader is ready")).toBeNull()
  })

  /** One at a time: each update exports and uploads a whole book. */
  it("updates every outdated link, one after another, and none that are current", async () => {
    getPublications.mockResolvedValue(twoOutdated())
    const finishers: (() => void)[] = []
    publishBookVersion.mockImplementation(
      () => new Promise<void>((resolve) => finishers.push(resolve)),
    )
    renderDashboard()

    const banner = await screen.findByTestId("host-updates-banner")
    await act(async () => {
      fireEvent.click(within(banner).getByRole("button", { name: /update all/i }))
    })

    expect(publishBookVersion).toHaveBeenCalledTimes(1)
    expect(publishBookVersion.mock.calls[0]?.[0]).toBe("raven")
    await waitFor(() => expect(screen.getByTestId("host-updates-banner").textContent).toContain("1 of 2"))
    expect(within(screen.getByTestId("publication-card-owl")).getByText("Waiting to update")).toBeTruthy()

    await act(async () => {
      finishers[0]?.()
    })
    await waitFor(() => expect(publishBookVersion).toHaveBeenCalledTimes(2))
    expect(publishBookVersion.mock.calls[1]?.[0]).toBe("owl")
    await act(async () => {
      finishers[1]?.()
    })
    expect(publishBookVersion.mock.calls.map((call) => call[0])).not.toContain("fox")
  })
})
