// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PublicationSummary } from "@adt/types"

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
    <a href={to} data-to={to} data-params={params ? JSON.stringify(params) : undefined} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/api/client", () => ({
  getBookCoverUrl: (label: string) => `/books/${label}/cover`,
}))

const { BookPublishedStrip } = await import("./BookPublishedStrip")

const URL = "https://adt-publish.escola.workers.dev/p/TokenRavenTokenRavenTokenRaven12/"

function summary(overrides: Partial<PublicationSummary> = {}): PublicationSummary {
  return {
    token: "TokenRavenTokenRavenTokenRaven12",
    title: "Raven and the Sun",
    book_label: "raven",
    book_exists: true,
    url: URL,
    current_version: 2,
    version_count: 2,
    created_at: "2026-08-01T09:00:00.000Z",
    last_published_at: "2026-08-04T09:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    has_access_code: false,
    access_code: null,
    comment_count: 5,
    unresolved_count: 3,
    snapshot_bytes: 1024,
    source: "worker",
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("BookPublishedStrip", () => {
  it("says the link is live, shows it, and opens it outside the app", () => {
    render(<BookPublishedStrip publication={summary()} countsKnown />)

    expect(screen.getByTestId("book-published-strip-raven").dataset.state).toBe("active")
    expect(screen.getByText("Live")).toBeTruthy()
    expect(screen.getByText(URL)).toBeTruthy()

    /** Named after the book, because the home screen draws one of these per published book and
     *  a screen reader announcing four identical "Open" links has told the author nothing. */
    const preview = screen.getByRole("link", { name: /open raven and the sun as readers see it/i })
    expect(preview.getAttribute("href")).toBe(URL)
    /** `_blank` is what the Electron main process turns into `shell.openExternal`, so losing it
     *  would open the published book inside the Studio's own window. */
    expect(preview.getAttribute("target")).toBe("_blank")
  })

  it("counts the comments and how many are still open, and leads to the storyboard", () => {
    render(<BookPublishedStrip publication={summary()} countsKnown />)

    const comments = screen.getByRole("link", { name: /5 comments/i })
    expect(comments.textContent).toContain("3 open")
    expect(comments.dataset.to).toBe("/books/$label/$step")
    expect(JSON.parse(comments.dataset.params ?? "{}")).toEqual({
      label: "raven",
      step: "storyboard",
    })
  })

  it("says so plainly when nobody has commented, with no open badge", () => {
    render(
      <BookPublishedStrip
        publication={summary({ comment_count: 0, unresolved_count: 0 })}
        countsKnown
      />,
    )

    expect(screen.getByRole("link", { name: /no comments/i })).toBeTruthy()
    expect(screen.queryByText(/open$/)).toBeNull()
  })

  it("caps a runaway open count instead of stretching the card", () => {
    render(
      <BookPublishedStrip
        publication={summary({ comment_count: 420, unresolved_count: 128 })}
        countsKnown
      />,
    )

    expect(screen.getByText("99+ open")).toBeTruthy()
    expect(screen.queryByText("128 open")).toBeNull()
  })

  it("shows no count at all when the counts were never measured", () => {
    render(
      <BookPublishedStrip
        publication={summary({ comment_count: 0, unresolved_count: 0, source: "local" })}
        countsKnown={false}
      />,
    )

    /** A zero here would be a claim nobody checked: the worker was unreachable, so the honest
     *  answer is silence, not "no comments". */
    expect(screen.queryByText(/comments?/i)).toBeNull()
    expect(screen.getByText("Live")).toBeTruthy()
  })

  it("keeps its own vocabulary for a link that is no longer open", () => {
    render(
      <BookPublishedStrip
        publication={summary({ revoked_at: "2026-08-05T09:00:00.000Z" })}
        countsKnown
      />,
    )

    expect(screen.getByTestId("book-published-strip-raven").dataset.state).toBe("revoked")
    expect(screen.getByText("Sharing stopped")).toBeTruthy()
  })

  it("copies the link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })

    render(<BookPublishedStrip publication={summary()} countsKnown />)
    fireEvent.click(screen.getByRole("button", { name: /copy the link to/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL))
  })
})
