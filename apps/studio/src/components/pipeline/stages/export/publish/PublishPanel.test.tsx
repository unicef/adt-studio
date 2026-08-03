// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { BookPublicationStatus, PublishProgressEvent, PublishStreamOptions } from "@/api/client"

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
const setBookPublicationExpiry = vi.fn()
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
    setBookPublicationExpiry,
    getCloudflareConnection,
  },
  ApiError: MockApiError,
  apiErrorCode: (error: unknown) => (error instanceof MockApiError ? error.code : null),
}))

const { PublishPanel } = await import("./PublishPanel")

const SHARE_URL = "https://adt-publish.escola-azul.workers.dev/p/abcdefghijklmnopqrstuvwxyz012345"

function notConnected(): BookPublicationStatus {
  return { connected: false, record: null, publication: null, url: null, worker_reachable: false }
}

function neverPublished(): BookPublicationStatus {
  return { connected: true, record: null, publication: null, url: null, worker_reachable: true }
}

function publishedStatus(
  overrides: Partial<BookPublicationStatus> = {},
): BookPublicationStatus {
  return {
    connected: true,
    worker_reachable: true,
    url: SHARE_URL,
    record: {
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
    expect(screen.getAllByRole("radio").length).toBe(4)
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

  it("offers a fresh link after the author stopped sharing", async () => {
    getBookPublication.mockResolvedValue(revokedStatus())

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publication-revoked")).toBeTruthy())
    expect(screen.getByTestId("publication-revoked").textContent).toContain(
      "old link no longer opens",
    )
    expect(screen.getByTestId("publish-start-button").textContent).toContain("Publish again")
    expect(screen.queryByTestId("publish-share-link")).toBeNull()
  })

  it("makes the link the hero of the published state, with its version history", async () => {
    getBookPublication.mockResolvedValue(publishedStatus())

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-share-link")).toBeTruthy())
    expect(screen.getByTestId("publish-share-link").textContent).toContain(SHARE_URL)
    expect(screen.getByTestId("publish-expiry-summary").textContent).toContain("no end date")
    expect(screen.getByTestId("publish-version-2").textContent).toContain("26 pages")
    expect(screen.getByTestId("publish-version-1").textContent).toContain("24 pages")
    expect(screen.getByTestId("publish-update-button")).toBeTruthy()
    expect(screen.getByTestId("publish-revoke-button")).toBeTruthy()
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
  it("streams the four steps and lands on the share link", async () => {
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
    expect(screen.getByTestId("publish-checklist").textContent).toContain("Step 1 of 4")

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

    await waitFor(() => expect(screen.getByTestId("publish-share-link")).toBeTruthy())
    expect(screen.getByTestId("publish-share-link").textContent).toContain(SHARE_URL)
    expect(screen.getByTestId("publish-recent-run").textContent).toContain("Your book is online")
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

    expect(screen.getByTestId("publish-error-worker_unreachable").textContent).toContain(
      "this computer is online",
    )
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

  it("re-exports under the same link when the author updates the site", async () => {
    getBookPublication.mockResolvedValue(publishedStatus())
    publishBookVersion.mockImplementation(() => new Promise<void>(() => {}))

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-update-button")).toBeTruthy())
    fireEvent.click(screen.getByTestId("publish-update-button"))

    expect(publishBookVersion).toHaveBeenCalledTimes(1)
    expect(publishBookVersion.mock.calls[0][0]).toBe("meu-livro")
    expect(screen.getByTestId("publish-checklist")).toBeTruthy()
    expect(screen.getByTestId("publish-share-link").textContent).toContain(SHARE_URL)
  })
})

describe("PublishPanel — link management", () => {
  it("copies the link and says so", async () => {
    getBookPublication.mockResolvedValue(publishedStatus())

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-share-link")).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy the share link/i }))
    })

    expect(writeText).toHaveBeenCalledWith(SHARE_URL)
    await waitFor(() =>
      expect(screen.getByTestId("publish-share-link").textContent).toContain("Link copied"),
    )
  })

  it("asks for confirmation before the link stops working, then revokes", async () => {
    getBookPublication.mockResolvedValue(publishedStatus())
    revokeBookPublication.mockResolvedValue({ publication: revokedStatus().publication })

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-revoke-button")).toBeTruthy())
    fireEvent.click(screen.getByTestId("publish-revoke-button"))

    await waitFor(() => expect(screen.getByTestId("revoke-dialog")).toBeTruthy())
    const dialog = screen.getByTestId("revoke-dialog")
    expect(dialog.textContent).toContain("stops working straight away")
    expect(dialog.textContent).toContain("everyone who has it")
    expect(revokeBookPublication).not.toHaveBeenCalled()

    getBookPublication.mockResolvedValue(revokedStatus())
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^stop sharing$/i }))
    })

    expect(revokeBookPublication).toHaveBeenCalledWith("meu-livro")
    await waitFor(() => expect(screen.getByTestId("publication-revoked")).toBeTruthy())
  })

  it("changes the end date through the expiry route", async () => {
    getBookPublication.mockResolvedValue(publishedStatus())
    setBookPublicationExpiry.mockResolvedValue({ publication: publishedStatus().publication })

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("publish-expiry-summary")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /add an end date/i }))

    await waitFor(() => expect(screen.getByTestId("publish-expiry-choice")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /30 days/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save end date/i }))
    })

    expect(setBookPublicationExpiry).toHaveBeenCalledTimes(1)
    expect(setBookPublicationExpiry.mock.calls[0][0]).toBe("meu-livro")
    const expiresAt = setBookPublicationExpiry.mock.calls[0][1] as string
    const days = (Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })
})
