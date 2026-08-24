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
  },
  ApiError: MockApiError,
  apiErrorCode: (error: unknown) => (error instanceof MockApiError ? error.code : null),
}))

const { PublishPanel } = await import("./PublishPanel")

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

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PublishPanel bookLabel="meu-livro" />
    </QueryClientProvider>,
  )
}

const writeText = vi.fn(() => Promise.resolve())

beforeEach(() => {
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

describe("PublishPanel — states", () => {
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
  it("refuses to be squeezed flat by the scrolling column it sits in", async () => {
    getBookPublication.mockResolvedValue(notConnected())

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-panel")).toBeTruthy())
    expect(screen.getByTestId("publish-panel").className).toContain("shrink-0")
  })

  it("sends the author to Settings when Cloudflare isn't connected", async () => {
    getBookPublication.mockResolvedValue(notConnected())

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-not-connected")).toBeTruthy())
    expect(screen.getByTestId("publish-not-connected").textContent).toContain(
      "needs a Cloudflare account connected once",
    )
    expect(screen.getByRole("link", { name: /set up publishing/i }).getAttribute("href")).toBe(
      "/settings",
    )
    expect(screen.queryByTestId("publish-start-button")).toBeNull()
  })

  it("explains the frozen copy and offers an end date before the first publish", async () => {
    getBookPublication.mockResolvedValue(neverPublished())

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    expect(document.body.textContent).toContain("frozen copy")
    expect(document.body.textContent).toContain("Update site")
    /** Two access answers plus the four end-date answers. */
    expect(screen.getAllByRole("radio").length).toBe(6)
    expect(screen.getByTestId("publish-start-button").textContent).toContain(
      "Publish and get a link",
    )
  })

  it("degrades to a plain notice when the route isn't there yet", async () => {
    getBookPublication.mockRejectedValue(new MockApiError("Request failed: 404", 404))

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publication-unavailable")).toBeTruthy())
    expect(screen.getByTestId("publication-unavailable").textContent).toContain(
      "Request failed: 404",
    )
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy()
  })

  it("offers both ways back after the author stopped sharing, resuming first", async () => {
    getBookPublication.mockResolvedValue(revokedStatus())

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publication-revoked")).toBeTruthy())
    const notice = screen.getByTestId("publication-revoked")
    expect(notice.textContent).toContain("old link no longer opens")
    expect(notice.textContent).toContain("same address starts working again")
    expect(notice.textContent).toContain("all the comments are kept")
    expect(screen.getByTestId("publish-resume-button").textContent).toContain("Resume sharing")

    expect(screen.getByTestId("publish-start-button").textContent).toContain("Publish again")
    expect(document.body.textContent).toContain("new address instead")
    expect(document.body.textContent).toContain("old link stays off")
    expect(screen.queryByTestId("publish-share-link")).toBeNull()
    expect(resumeBookPublication).not.toHaveBeenCalled()
  })

  it("mentions a waiting publishing-service update without nagging", async () => {
    getBookPublication.mockResolvedValue(publishedStatus())
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

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-upgrade-hint")).toBeTruthy())
    expect(screen.getByTestId("publish-upgrade-hint").textContent).toContain("update is waiting")
  })
})

describe("PublishPanel — publishing", () => {
  it("streams the four steps", async () => {
    getBookPublication.mockResolvedValue(neverPublished())

    let emit: ((event: PublishProgressEvent) => void) | null = null
    let finishStream: (() => void) | null = null
    publishBook.mockImplementation((_label: string, options: PublishStreamOptions) => {
      emit = options.onEvent
      return new Promise<void>((resolve) => {
        finishStream = resolve
      })
    })

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    fireEvent.click(screen.getByTestId("publish-start-button"))

    expect(publishBook).toHaveBeenCalledTimes(1)
    expect(publishBook.mock.calls[0][0]).toBe("meu-livro")
    expect(publishBook.mock.calls[0][1].expiresAt).toBeNull()

    act(() => {
      emit?.({ type: "step", id: "export", number: 1, label: "Export", status: "running" })
    })
    expect(screen.getByTestId("publish-step-1").getAttribute("data-state")).toBe("running")
    expect(screen.getByTestId("publish-step-4").getAttribute("data-state")).toBe("pending")
    /** The calm loader counts settled steps, so the first running step reads as "0 of 4". */
    expect(screen.getByTestId("publish-checklist").textContent).toContain("0 of 4")

    act(() => {
      emit?.({ type: "step", id: "export", number: 1, label: "Export", status: "done" })
      emit?.({ type: "step", id: "upload", number: 3, label: "Upload", status: "running" })
    })
    expect(screen.getByTestId("publish-step-1").getAttribute("data-state")).toBe("done")
    expect(screen.getByTestId("publish-step-3").getAttribute("data-state")).toBe("running")

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

    /** The panel's job ends when the run does. The link and everything that can be done to it
     *  belong to the Publishing dashboard, which the page swaps in the moment one exists — so
     *  what this panel does on success is hand over: no loader, no link, nothing to press. */
    await waitFor(() => expect(screen.queryByTestId("publish-checklist")).toBeNull())
    expect(screen.queryByTestId("publish-share-link")).toBeNull()
    expect(screen.queryByTestId("publish-start-button")).toBeNull()
  })

  it("passes the chosen end date to the publish route", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockImplementation(() => new Promise<void>(() => {}))

    renderPanel()

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

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    const requireCode = screen.getByRole("radio", { name: /require an access code/i })
    expect((requireCode as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole("radio", { name: /anyone with the link/i }) as HTMLInputElement).checked).toBe(false)

    const shown = (screen.getByTestId("publish-access-code-input") as HTMLInputElement).value
    expect(shown).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)

    fireEvent.click(screen.getByTestId("publish-start-button"))
    expect(publishBook.mock.calls[0][1].accessCode).toBe(shown)
  })

  it("gives a fresh code on demand and keeps the one the author is looking at", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockImplementation(() => new Promise<void>(() => {}))

    renderPanel()

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

    renderPanel()

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

    renderPanel()

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

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /anyone with the link/i }))
    expect(screen.queryByTestId("publish-access-code-input")).toBeNull()

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

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    fireEvent.click(screen.getByTestId("publish-start-button"))

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
    expect(screen.getByTestId("publish-step-3").getAttribute("data-state")).toBe("error")
    expect(screen.getByTestId("publish-start-button").textContent).toContain("Try publishing again")

    fireEvent.click(screen.getByTestId("publish-start-button"))
    expect(publishBook).toHaveBeenCalledTimes(2)
  })

  it("explains a missing Cloudflare connection returned before the stream opens", async () => {
    getBookPublication.mockResolvedValue(neverPublished())
    publishBook.mockRejectedValue(
      new MockApiError("Cloudflare is not connected", 412, "publish_not_connected"),
    )

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-start-button")).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId("publish-start-button"))
    })

    await waitFor(() =>
      expect(screen.getByTestId("publish-error-publish_not_connected")).toBeTruthy(),
    )
    const notice = screen.getByTestId("publish-error-publish_not_connected")
    expect(notice.textContent).toContain("needs a Cloudflare account connected first")
    expect(screen.getByRole("link", { name: /open publishing settings/i })).toBeTruthy()
  })

})

describe("PublishPanel — link management", () => {
  it("resumes sharing on the same link and lands back on the published state", async () => {
    getBookPublication.mockResolvedValue(revokedStatus())
    resumeBookPublication.mockResolvedValue({ publication: publishedStatus().publication })

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-resume-button")).toBeTruthy())
    getBookPublication.mockResolvedValue(publishedStatus())
    await act(async () => {
      fireEvent.click(screen.getByTestId("publish-resume-button"))
    })

    expect(resumeBookPublication).toHaveBeenCalledWith("meu-livro")
    /** Resuming makes the link live again, and a live link is the dashboard's to show — so what
     *  this panel does is stop saying the sharing is stopped. */
    await waitFor(() => expect(screen.queryByTestId("publication-revoked")).toBeNull())
  })

  it("keeps the link off and says so when resuming fails", async () => {
    getBookPublication.mockResolvedValue(revokedStatus())
    resumeBookPublication.mockRejectedValue(
      new MockApiError("The publish worker answered 502", 502, "worker_unreachable"),
    )

    renderPanel()

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
