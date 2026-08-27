// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PUBLICATION_ACCESS_CODE_ALPHABET } from "@adt/types"
import type { BookPublicationRecord } from "@/api/client"

/**
 * The published link's settings and its two actions.
 *
 * These behaviours used to live in `PublishedState` inside `PublishPanel`, which the Publishing
 * dashboard replaced; the tests moved here with them rather than being deleted, because what they
 * cover — a rotated code, a removed code, a changed end date, a confirmed revoke — is the part of
 * this feature that changes what strangers can read.
 */

/* The Lingui macro transform rewrites macro imports to `@lingui/react` at build time, so a mock of
   the macro path never intercepts the components' real calls — this one does. Messages come
   through as `{id, message, values}` descriptors; interpolation is the naive `{name}` swap, which
   is all these assertions need. */
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

const setBookPublicationAccessCode = vi.fn()
const setBookPublicationExpiry = vi.fn()
const revokeBookPublication = vi.fn()

vi.mock("@/api/client", () => ({
  api: { setBookPublicationAccessCode, setBookPublicationExpiry, revokeBookPublication },
  apiErrorCode: () => null,
}))

const { PublishingControls } = await import("./PublishingControls")
const { PublishingActions } = await import("./PublishingActions")

function record(overrides: Partial<BookPublicationRecord> = {}): BookPublicationRecord {
  return {
    token: "abcdefghijklmnopqrstuvwxyz012345",
    base_url: "https://adt-publish.example.workers.dev",
    worker_url: "https://adt-publish.example.workers.dev",
    created_at: "2026-07-20T10:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    versions: [
      { version: 1, published_at: "2026-07-20T10:00:00.000Z", page_count: 24, content_revision: 8 },
    ],
    access_code: "K7M4QP",
    has_access_code: true,
    ...overrides,
  }
}

function renderControls(overrides: Partial<BookPublicationRecord> = {}, hasAccessCode = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PublishingControls
        bookLabel="meu-livro"
        record={record(overrides)}
        hasAccessCode={hasAccessCode}
        isUpdating={false}
      />
    </QueryClientProvider>,
  )
}

const writeText = vi.fn(() => Promise.resolve())

beforeEach(() => {
  setBookPublicationAccessCode.mockResolvedValue({ publication: {}, has_access_code: true })
  setBookPublicationExpiry.mockResolvedValue({ publication: {}, has_access_code: true })
  revokeBookPublication.mockResolvedValue({ publication: {}, has_access_code: true })
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PublishingControls — the access code", () => {
  it("shows the code and copies it", async () => {
    renderControls()
    const chip = screen.getByRole("button", { name: /access code K7M4QP/i })
    expect(chip.textContent).toContain("K7M4QP")
    fireEvent.click(chip)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("K7M4QP"))
  })

  /**
   * Rotating locks out everybody holding the old code, including people reading right now, so it
   * asks first — and the warning is the confirmation, not a paragraph parked on the page.
   */
  it("asks before rotating, then sends a code from the safe alphabet", async () => {
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: /new code/i }))
    expect(document.body.textContent).toContain("Locks out everyone using the old code")
    expect(setBookPublicationAccessCode).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }))
    await waitFor(() => expect(setBookPublicationAccessCode).toHaveBeenCalledTimes(1))
    const sent = setBookPublicationAccessCode.mock.calls[0][1] as string
    expect(sent).toHaveLength(6)
    for (const character of sent) {
      expect(PUBLICATION_ACCESS_CODE_ALPHABET).toContain(character)
    }
  })

  it("lets the author back out of a rotation without changing anything", () => {
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: /new code/i }))
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(setBookPublicationAccessCode).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /new code/i })).toBeTruthy()
  })

  it("removes the code with a null update", async () => {
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }))
    await waitFor(() => expect(setBookPublicationAccessCode).toHaveBeenCalledWith("meu-livro", null))
  })

  /** An open link offers to close itself, and never claims a code it does not have. */
  it("offers to add a code to an open link", async () => {
    renderControls({ access_code: null, has_access_code: false }, false)
    expect(document.body.textContent).toContain("Anyone with the link")
    fireEvent.click(screen.getByRole("button", { name: /add a code/i }))
    await waitFor(() => expect(setBookPublicationAccessCode).toHaveBeenCalledTimes(1))
    expect(setBookPublicationAccessCode.mock.calls[0][1]).not.toBeNull()
  })

  it("says the change failed rather than pretending it landed", async () => {
    setBookPublicationAccessCode.mockRejectedValue(new Error("nope"))
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }))
    await waitFor(() =>
      expect(document.body.textContent).toContain("didn't go through, so nothing changed"),
    )
  })
})

describe("PublishingControls — the end date", () => {
  it("reads out the current end date", () => {
    renderControls({ expires_at: "2026-09-12T00:00:00.000Z" })
    expect(screen.getByTestId("publish-expiry-summary").textContent).not.toContain("No end date")
  })

  it("changes the end date through the expiry route", async () => {
    renderControls()
    expect(screen.getByTestId("publish-expiry-summary").textContent).toContain("No end date")
    fireEvent.click(screen.getByRole("button", { name: /add one/i }))
    fireEvent.click(screen.getByRole("radio", { name: /7 days/i }))
    await waitFor(() => expect(setBookPublicationExpiry).toHaveBeenCalledTimes(1))
    expect(setBookPublicationExpiry.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe("PublishingActions", () => {
  function renderActions(isUpdating = false) {
    const onUpdate = vi.fn()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <PublishingActions bookLabel="meu-livro" isUpdating={isUpdating} onUpdate={onUpdate} />
      </QueryClientProvider>,
    )
    return onUpdate
  }

  it("runs an update on demand", () => {
    const onUpdate = renderActions()
    fireEvent.click(screen.getByTestId("publish-update-button"))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it("locks both actions while a run is in flight", () => {
    renderActions(true)
    expect(screen.getByTestId("publish-update-button").hasAttribute("disabled")).toBe(true)
    expect(screen.getByTestId("publish-revoke-button").hasAttribute("disabled")).toBe(true)
  })

  /** Turning a link off is the one action here a stranger notices immediately, so it confirms. */
  it("asks for confirmation before the link stops working, then revokes", async () => {
    renderActions()
    fireEvent.click(screen.getByTestId("publish-revoke-button"))
    await waitFor(() => expect(screen.getByTestId("revoke-dialog")).toBeTruthy())
    expect(revokeBookPublication).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /stop sharing/i, exact: false }))
    await waitFor(() => expect(revokeBookPublication).toHaveBeenCalledWith("meu-livro"))
  })
})
