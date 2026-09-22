// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { BookPublicationStatus, PublishProgressEvent, PublishStreamOptions } from "@/api/client"

vi.mock("@/hooks/use-export-features", () => ({
  /** The panel only needs to know what the book has, and resolving that for real pulls in the
   *  pipeline run context this suite has no provider for. */
  useAllProjectFeatures: () => ({
    toggleable: { glossary: true, readAloud: true, quizzes: true, signLanguage: false },
    present: { captions: false, toc: false, easyRead: false },
  }),
}))

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

/* jsdom has no ResizeObserver, and the takeover's artwork measures its slot with one on its
   optimistic first frame — before the height check drops it for the 0px window jsdom reports. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub)

/* The macro transform rewrites `@lingui/react/macro` imports into `@lingui/react` at build time,
 * so the mock above never intercepts the compiled calls — this one does. Same recipe as
 * `publishing-controls.test.tsx`: resolve descriptors to their English source and interpolate
 * `{name}` values naively. */
vi.mock("@lingui/react", () => {
  const fill = (text: string, values?: Record<string, unknown>) =>
    Object.entries(values ?? {}).reduce(
      (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
      text,
    )
  const resolve = (descriptor: unknown, values?: Record<string, unknown>): string => {
    if (typeof descriptor === "string") return fill(descriptor, values)
    const d = descriptor as { message?: string; id?: string; values?: Record<string, unknown> }
    return fill(d?.message ?? d?.id ?? "", values ?? d?.values)
  }
  return {
    I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useLingui: () => ({
      _: resolve,
      t: resolve,
      i18n: { locale: "en", _: resolve, number: (n: number) => String(n) },
    }),
    Trans: ({
      message,
      id,
      values,
      children,
    }: {
      message?: string
      id?: string
      values?: Record<string, unknown>
      children?: React.ReactNode
    }) => {
      const text = (message ?? id ?? "").replace(/<\/?\d+>/g, "")
      return <>{children ?? fill(text, values)}</>
    },
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
    children,
    to,
  }: {
    children: React.ReactNode
    to: string
    search?: Record<string, unknown>
  }) => <a href={to}>{children}</a>,
}))

const getBookPublication = vi.fn()
const publishBook = vi.fn()
const publishBookVersion = vi.fn()
const revokeBookPublication = vi.fn()
const resumeBookPublication = vi.fn()
const setBookPublicationExpiry = vi.fn()
const setBookPublicationAccessCode = vi.fn()
const getCloudflareConnection = vi.fn()
const getBook = vi.fn()
/** The live dashboard the page swaps in once a run lands; these keep its lists from erroring
 *  where the assertions are about the run, not about them. */
const getPublicationReaders = vi.fn()
const getPublicationComments = vi.fn()
const getPublicationPages = vi.fn()

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
    publishBook,
    publishBookVersion,
    revokeBookPublication,
    resumeBookPublication,
    setBookPublicationExpiry,
    setBookPublicationAccessCode,
    getCloudflareConnection,
    getBook,
    getPublicationReaders,
    getPublicationComments,
    getPublicationPages,
  },
  getBookCoverUrl: (label: string) => `/api/books/${label}/cover`,
  ApiError: MockApiError,
  apiErrorCode: (error: unknown) => (error instanceof MockApiError ? error.code : null),
}))

const { PublishingLandingPage } = await import("../PublishingLandingPage")

const SHARE_URL = "https://adt-publish.escola-azul.workers.dev/p/abcdefghijklmnopqrstuvwxyz012345"

function notConnected(): BookPublicationStatus {
  return {
    connected: false,
    record: null,
    publication: null,
    url: null,
    worker_reachable: false,
    has_access_code: false,
  }
}

function neverPublished(): BookPublicationStatus {
  return {
    connected: true,
    record: null,
    publication: null,
    url: null,
    worker_reachable: true,
    has_access_code: false,
  }
}

function publishedStatus(
  overrides: Partial<BookPublicationStatus> = {},
): BookPublicationStatus {
  return {
    connected: true,
    worker_reachable: true,
    url: SHARE_URL,
    has_access_code: false,
    record: {
      access_code: null,
      has_access_code: false,
      token: "abcdefghijklmnopqrstuvwxyz012345",
      base_url: "https://adt-publish.escola-azul.workers.dev",
      worker_url: "https://adt-publish.escola-azul.workers.dev",
      created_at: "2026-07-20T10:00:00.000Z",
      expires_at: null,
      revoked_at: null,
      versions: [
        { version: 1, published_at: "2026-07-20T10:00:00.000Z", page_count: 24 },
        { version: 2, published_at: "2026-08-01T09:30:00.000Z", page_count: 26 },
      ],
    },
    publication: {
      token: "abcdefghijklmnopqrstuvwxyz012345",
      title: "Meu Livro",
      book_label: "meu-livro",
      current_version: 2,
      created_at: "2026-07-20T10:00:00.000Z",
      expires_at: null,
      revoked_at: null,
    },
    ...overrides,
  }
}

function gatedStatus(code: string | null = "K7M4QP"): BookPublicationStatus {
  const base = publishedStatus()
  return {
    ...base,
    has_access_code: true,
    record: { ...base.record!, access_code: code, has_access_code: true },
  }
}

function revokedStatus(): BookPublicationStatus {
  const base = publishedStatus()
  return {
    ...base,
    record: { ...base.record!, revoked_at: "2026-08-02T12:00:00.000Z" },
    publication: { ...base.publication!, revoked_at: "2026-08-02T12:00:00.000Z" },
  }
}

/** The setup screen owns its run view, so everything — the form, the run, the hand-off to the
 *  dashboard — is asked of the page that mounts it. */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PublishingLandingPage bookLabel="meu-livro" />
    </QueryClientProvider>,
  )
}

const writeText = vi.fn(() => Promise.resolve())

beforeEach(() => {
  getBook.mockResolvedValue({ label: "meu-livro", title: "Meu Livro" })
  getPublicationReaders.mockResolvedValue({ readers: [], total: 0 })
  getPublicationComments.mockResolvedValue({ comments: [] })
  getPublicationPages.mockResolvedValue({ pages: [] })
  getCloudflareConnection.mockResolvedValue({
    connected: true,
    auth_method: "oauth",
    worker_url: "https://adt-publish.escola-azul.workers.dev",
    worker_version: "0.1.0",
    latest_version: "0.1.0",
    upgrade_available: false,
    worker_reachable: true,
    resources: null,
    provisioned_at: null,
    updated_at: null,
  })
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("Sharing setup — states", () => {
  /**
   * The panel once rendered every word of itself into a card two pixels tall.
   *
   * It lives in the export shell's scrolling flex column, and `overflow-hidden` — which the
   * rounded corners need — sets a flex item's automatic minimum size to zero. So the moment the
   * page overflowed, the column was free to squeeze this card down to its borders: content
   * present, `scrollHeight` over a thousand pixels, height 2px, invisible.
   *
   * jsdom computes no layout, so this asserts the class that prevents it rather than the height.
   * A weak test for a bug that cost an evening is still worth having.
   */
  it("keeps the same two columns in every state, with the reader's view on the right", async () => {
    getBookPublication.mockResolvedValue(notConnected())

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-reader-preview")).toBeTruthy())
    /** No account yet means no reader yet: the view is there, greyed, rather than a different
     *  page that would reflow once the account exists. */
    expect(screen.getByTestId("publish-reader-preview").getAttribute("data-mode")).toBe("locked")
  })

  it("sends the author to Settings when Cloudflare isn't connected", async () => {
    getBookPublication.mockResolvedValue(notConnected())

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-not-connected")).toBeTruthy())
    expect(screen.getByTestId("publish-not-connected").textContent).toContain(
      "connected once for the whole Studio",
    )
    expect(screen.getByRole("link", { name: /set up sharing/i }).getAttribute("href")).toBe(
      "/settings",
    )
    expect(screen.queryByTestId("publish-start-button")).toBeNull()
  })

  it("says readers get the book as it is now, and offers an end date before the first share", async () => {
    getBookPublication.mockResolvedValue(neverPublished())

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    expect(document.body.textContent).toContain("Readers see the book as it is now")
    /** Two access answers plus the four end-date answers. */
    expect(screen.getAllByRole("radio").length).toBe(6)
    /** The parts are switches, and only the ones this book has: this suite's book has no sign
     *  language, so it offers no switch for it. */
    expect(screen.getAllByRole("switch").map((el) => el.getAttribute("aria-checked"))).toEqual([
      "true",
      "true",
      "true",
    ])
    expect(screen.queryByRole("switch", { name: /sign language/i })).toBeNull()
    expect(screen.getByTestId("publish-start-button").textContent).toContain(
      "Share and get a link",
    )
  })

  it("says it couldn't check the book, keeps the raw reason, and offers a retry", async () => {
    getBookPublication.mockRejectedValue(new MockApiError("Request failed: 404", 404))

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publication-unavailable")).toBeTruthy())
    expect(screen.getByTestId("publication-unavailable").textContent).toContain(
      "Request failed: 404",
    )
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy()
  })

  it("offers both ways back after the author stopped sharing, resuming first", async () => {
    getBookPublication.mockResolvedValue(revokedStatus())

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publication-revoked")).toBeTruthy())
    const notice = screen.getByTestId("publication-revoked")
    expect(notice.textContent).toContain("doesn't open right now")
    expect(notice.textContent).toContain("same link back on")
    expect(notice.textContent).toContain("every comment kept")
    expect(screen.getByTestId("publish-resume-button").textContent).toContain("Resume sharing")

    /** Resuming is the main way back; a new link is offered, quieter, underneath it. */
    expect(screen.getByTestId("publish-start-button").textContent).toContain("new link")
    /** The reader's view shows the closed page readers get today, on the address they have. */
    const preview = screen.getByTestId("publish-reader-preview")
    expect(preview.getAttribute("data-mode")).toBe("stopped")
    expect(preview.textContent).toContain("adt-publish.escola-azul.workers.dev")
    expect(resumeBookPublication).not.toHaveBeenCalled()
  })

  it("mentions a waiting publishing-service update above the setup", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    getBook.mockResolvedValue({ label: "meu-livro", title: "Meu Livro" })
  getPublicationReaders.mockResolvedValue({ readers: [], total: 0 })
  getPublicationComments.mockResolvedValue({ comments: [] })
  getPublicationPages.mockResolvedValue({ pages: [] })
  getCloudflareConnection.mockResolvedValue({
      connected: true,
      auth_method: "oauth",
      worker_url: "https://adt-publish.escola-azul.workers.dev",
      worker_version: "0.1.0",
      latest_version: "0.2.0",
      upgrade_available: true,
      worker_reachable: true,
      resources: null,
      provisioned_at: null,
      updated_at: null,
    })

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-engine-outdated")).toBeTruthy())
    expect(screen.getByTestId("publish-engine-outdated").textContent).toContain("Install the update")
  })
})

describe("Sharing setup — publishing", () => {
  /**
   * A first publish is a wait of minutes, and it gets the whole screen for the same reason an
   * update does: a checklist inside a card is something the author has to go and find.
   */
  it("hands the page to the run, and hands it back to the dashboard", async () => {
    getBookPublication.mockResolvedValue(neverPublished())

    let emit: ((event: PublishProgressEvent) => void) | null = null
    let finishStream: (() => void) | null = null
    publishBook.mockImplementation((_label: string, options: PublishStreamOptions) => {
      emit = options.onEvent
      return new Promise<void>((resolve) => {
        finishStream = resolve
      })
    })

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    expect(screen.queryByTestId("publish-takeover")).toBeNull()
    fireEvent.click(screen.getByTestId("publish-start-button"))

    expect(publishBook).toHaveBeenCalledTimes(1)
    expect(publishBook.mock.calls[0][0]).toBe("meu-livro")
    expect(publishBook.mock.calls[0][1].expiresAt).toBeNull()

    act(() => {
      emit?.({ type: "step", id: "export", number: 1, label: "Export", status: "running" })
    })
    const takeover = screen.getByTestId("publish-takeover")
    /** The columns that asked the question step aside; leaving them beside a run gives the author
     *  two places to look and one of them is stale. */
    expect(screen.queryByTestId("publish-reader-preview")).toBeNull()
    /** The run screen names the running step and offers the way out. There is deliberately no
     *  "N of 4 steps" counter — a step-count aggregate jumps to 50% in seconds and then sits
     *  still for the whole upload, which is the trust failure the time-weighted bar replaced. */
    expect(takeover.textContent).toContain("Making a copy of the book")
    expect(takeover.textContent).toContain("Stop")

    act(() => {
      emit?.({ type: "step", id: "export", number: 1, label: "Export", status: "done" })
      emit?.({ type: "step", id: "upload", number: 3, label: "Upload", status: "running" })
    })
    expect(screen.getByTestId("publish-takeover").textContent).toContain(
      "Sending it to your Cloudflare account",
    )

    getBookPublication.mockResolvedValue(publishedStatus())

    await act(async () => {
      emit?.({
        type: "complete",
        publication: publishedStatus().publication!,
        version: {
          version: 2,
          page_manifest: [],
          created_at: "2026-08-01T09:30:00.000Z",
        },
        url: SHARE_URL,
      })
      finishStream?.()
    })

    /** The run's screen ends when the link exists. Everything that can be done to it belongs to
     *  the Publishing dashboard, which the page swaps in the moment there is one. */
    await waitFor(() => expect(screen.queryByTestId("publish-takeover")).toBeNull())
    expect(screen.queryByTestId("publish-start-button")).toBeNull()
  })

  /** Between the last step and the status query catching up, the page used to flash the form it
   *  had just been asked to submit. */
  it("stays on the run until the link it made is really there", async () => {
    getBookPublication.mockResolvedValue(neverPublished())

    let emit: ((event: PublishProgressEvent) => void) | null = null
    publishBook.mockImplementation((_label: string, options: PublishStreamOptions) => {
      emit = options.onEvent
      return new Promise<void>(() => {})
    })

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    fireEvent.click(screen.getByTestId("publish-start-button"))

    await act(async () => {
      emit?.({
        type: "complete",
        publication: publishedStatus().publication!,
        version: { version: 1, page_manifest: [], created_at: "2026-08-01T09:30:00.000Z" },
        url: SHARE_URL,
      })
    })

    expect(screen.getByTestId("publish-takeover").textContent).toContain("Your book is online")
    expect(screen.queryByTestId("publish-start-button")).toBeNull()
  })

  it("passes the chosen end date to the publish route", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockImplementation(() => new Promise<void>(() => {}))

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /7 days/i }))
    fireEvent.click(screen.getByTestId("publish-start-button"))

    const expiresAt = publishBook.mock.calls[0][1].expiresAt as string
    const days = (Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)
  })

  it("asks for an access code by default and publishes with the one it shows", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockImplementation(() => new Promise<void>(() => {}))

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    expect(screen.getByRole("radio", { name: /with a code/i }).getAttribute("aria-checked")).toBe("true")
    expect(
      screen.getByRole("radio", { name: /anyone with the link/i }).getAttribute("aria-checked"),
    ).toBe("false")

    const shown = (screen.getByTestId("publish-access-code-input") as HTMLInputElement).value
    expect(shown).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)

    fireEvent.click(screen.getByTestId("publish-start-button"))
    expect(publishBook.mock.calls[0][1].accessCode).toBe(shown)
  })

  it("gives a fresh code on demand and keeps the one the author is looking at", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockImplementation(() => new Promise<void>(() => {}))

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-access-code-input")).toBeTruthy())
    const input = () => screen.getByTestId("publish-access-code-input") as HTMLInputElement
    const first = input().value
    fireEvent.click(screen.getByTestId("publish-access-code-regenerate"))
    const second = input().value
    expect(second).not.toBe(first)
    expect(second).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)

    fireEvent.click(screen.getByTestId("publish-start-button"))
    expect(publishBook.mock.calls[0][1].accessCode).toBe(second)
  })

  it("takes the author's own code, upper-cased and space-free", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockImplementation(() => new Promise<void>(() => {}))

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-access-code-input")).toBeTruthy())
    fireEvent.change(screen.getByTestId("publish-access-code-input"), {
      target: { value: " turma 3b " },
    })
    expect((screen.getByTestId("publish-access-code-input") as HTMLInputElement).value).toBe(
      "TURMA3B",
    )

    fireEvent.click(screen.getByTestId("publish-start-button"))
    expect(publishBook.mock.calls[0][1].accessCode).toBe("TURMA3B")
  })

  it("refuses to publish a code that is too short, and says why", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockImplementation(() => new Promise<void>(() => {}))

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-access-code-input")).toBeTruthy())
    fireEvent.change(screen.getByTestId("publish-access-code-input"), { target: { value: "ab" } })

    expect(screen.getByTestId("publish-access-code-invalid").textContent).toContain(
      "4 to 12 characters",
    )
    expect((screen.getByTestId("publish-start-button") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId("publish-start-button"))
    expect(publishBook).not.toHaveBeenCalled()
  })

  it("publishes an open link when the author chooses anyone with the link", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockImplementation(() => new Promise<void>(() => {}))

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /anyone with the link/i }))
    /** The code row folds away rather than unmounting, so it can animate — but it must be out of
     *  reach while folded. */
    expect((screen.getByTestId("publish-access-code-input") as HTMLInputElement).disabled).toBe(true)

    fireEvent.click(screen.getByTestId("publish-start-button"))
    expect(publishBook.mock.calls[0][1].accessCode).toBeNull()
  })

  it("turns an unreachable service into human guidance and keeps a retry", async () => {
    getBookPublication.mockResolvedValue(neverPublished())

    let emit: ((event: PublishProgressEvent) => void) | null = null
    publishBook.mockImplementation((_label: string, options: PublishStreamOptions) => {
      emit = options.onEvent
      return new Promise<void>(() => {})
    })

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    fireEvent.click(screen.getByTestId("publish-start-button"))
    const chosenCode = publishBook.mock.calls[0][1].accessCode

    await act(async () => {
      emit?.({ type: "step", id: "upload", number: 3, label: "Upload", status: "error" })
      emit?.({
        type: "error",
        code: "worker_unreachable",
        message: "fetch failed",
        step_id: "upload",
      })
    })

    /** The substance rather than a phrase: that nothing reached the readers, and that the raw
     *  reason is shown rather than swallowed. Pinning the wording is what made this test fail on
     *  a copy change that improved it. */
    const notice = screen.getByTestId("publish-error-worker_unreachable").textContent ?? ""
    expect(notice).toContain("nothing was sent")
    expect(notice).toContain("fetch failed")

    /** Retrying repeats the run that failed, access code and all. Re-reading the form would hand
     *  back a freshly generated code and quietly publish under a different one. */
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(publishBook).toHaveBeenCalledTimes(2)
    expect(publishBook.mock.calls[1][1].accessCode).toBe(chosenCode)
  })

  /** A run that failed is over, and a screen about it with no way off is a dead end. */
  it("gives the form back when the author would rather change something", async () => {
    getBookPublication.mockResolvedValue(neverPublished())

    let emit: ((event: PublishProgressEvent) => void) | null = null
    publishBook.mockImplementation((_label: string, options: PublishStreamOptions) => {
      emit = options.onEvent
      return new Promise<void>(() => {})
    })

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    fireEvent.click(screen.getByTestId("publish-start-button"))

    await act(async () => {
      emit?.({ type: "error", code: "package_failed", message: "boom", step_id: "package" })
    })

    const chosenCode = publishBook.mock.calls[0][1].accessCode
    fireEvent.click(screen.getByRole("button", { name: /change how you share/i }))
    expect(screen.queryByTestId("publish-takeover")).toBeNull()
    expect(screen.getByTestId("publish-start-button").textContent).toContain(
      "Share and get a link",
    )
    /** The form was never unmounted under the run, so the answers come back as they were. */
    expect((screen.getByTestId("publish-access-code-input") as HTMLInputElement).value).toBe(
      chosenCode,
    )
  })

  it("explains a missing Cloudflare connection returned before the stream opens", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockRejectedValue(
      new MockApiError("Cloudflare is not connected", 412, "publish_not_connected"),
    )

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId("publish-start-button"))
    })

    await waitFor(() =>
      expect(screen.getByTestId("publish-error-publish_not_connected")).toBeTruthy(),
    )
    const notice = screen.getByTestId("publish-error-publish_not_connected")
    expect(notice.textContent).toContain("needs a Cloudflare account connected first")
    expect(screen.getByRole("link", { name: /open sharing settings/i })).toBeTruthy()
  })

})

describe("Sharing setup — link management", () => {
  it("resumes sharing on the same link and lands back on the published state", async () => {
    getBookPublication.mockResolvedValue(revokedStatus())
    resumeBookPublication.mockResolvedValue({ publication: publishedStatus().publication })

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-resume-button")).toBeTruthy())
    getBookPublication.mockResolvedValue(publishedStatus())
    await act(async () => {
      fireEvent.click(screen.getByTestId("publish-resume-button"))
    })

    expect(resumeBookPublication).toHaveBeenCalledWith("meu-livro")
    /** Resuming makes the link live again, and a live link is the dashboard's to show — so what
     *  the setup does is stop saying the sharing is stopped. */
    await waitFor(() => expect(screen.queryByTestId("publication-revoked")).toBeNull())
  })

  it("keeps the link off and says so when resuming fails", async () => {
    getBookPublication.mockResolvedValue(revokedStatus())
    resumeBookPublication.mockRejectedValue(
      new MockApiError("The publish worker answered 502", 502, "worker_unreachable"),
    )

    renderPage()

    await waitFor(() => expect(screen.getByTestId("publish-resume-button")).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId("publish-resume-button"))
    })

    await waitFor(() => expect(screen.getByTestId("publish-resume-error")).toBeTruthy())
    const error = screen.getByTestId("publish-resume-error")
    expect(error.textContent).toContain("still off")
    expect(error.textContent).toContain("The publish worker answered 502")
    expect(screen.getByTestId("publication-revoked")).toBeTruthy()
  })

})
