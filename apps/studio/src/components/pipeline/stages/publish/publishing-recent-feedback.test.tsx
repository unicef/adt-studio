// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { PublishComment } from "@/api/client"

vi.mock("@lingui/react/macro", () => {
  const fill = (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
      "",
    )
  return {
    Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useLingui: () => ({ t: fill, i18n: { _: (d: { id?: string }) => d?.id ?? "", locale: "en" } }),
  }
})

vi.mock("@lingui/react", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
        "",
      ),
    i18n: { _: (d: { id?: string }) => d?.id ?? "", locale: "en" },
  }),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, unknown>
  }) => (
    <a
      data-to={to}
      data-page={params?.pageId ?? ""}
      data-search={search ? JSON.stringify(search) : ""}
    >
      {children}
    </a>
  ),
}))

const resolveMutate = vi.fn()

vi.mock("@/hooks/use-publication-feedback", () => ({
  usePublicationComments: () => ({ data: { comments: mockComments }, isPending: false, isError: false }),
  usePublicationPages: () => ({ data: { pages: [] } }),
  useAuthorIdentity: () => ({ authorName: "Author" }),
  useResolveThread: () => ({ mutate: resolveMutate, isPending: false, variables: undefined }),
}))

let mockComments: PublishComment[] = []

const { PublishingRecentFeedback } = await import("./PublishingRecentFeedback")

function comment(id: string, sectionId: string): PublishComment {
  return {
    id,
    token: "tok",
    version: 1,
    page_section_id: sectionId,
    parent_id: null,
    session_id: `s-${id}`,
    author_name: `Reviewer ${id}`,
    author_color: "#f00",
    body: `comment body ${id}`,
    anchor: null,
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T10:00:00.000Z",
  }
}

afterEach(() => {
  cleanup()
  resolveMutate.mockReset()
})

describe("Waiting on you", () => {
  /** The panel that exists to say what is outstanding used to show three of them and hide the
   *  rest behind a trip to another stage. It sits in a bounded ScrollBox, so all of them fit. */
  it("lists every waiting thread, not the first three", () => {
    mockComments = Array.from({ length: 7 }, (_, i) =>
      comment(`c${i + 1}`, `pg00${i + 1}_sec001`),
    )
    render(<PublishingRecentFeedback bookLabel="raven" />)

    for (let i = 1; i <= 7; i++) {
      expect(screen.getByText(`comment body c${i}`)).toBeTruthy()
    }
  })

  it("points each row at the page and section its comment is on", () => {
    mockComments = [comment("c1", "pg012_sec002")]
    const { container } = render(<PublishingRecentFeedback bookLabel="raven" />)

    const link = container.querySelector("a")
    expect(link?.getAttribute("data-page")).toBe("pg012")
    expect(JSON.parse(link?.getAttribute("data-search") ?? "{}")).toEqual({
      section: 1,
      comment: "c1",
    })
  })

  /** Resolving is what makes a full list workable: a thread that is done leaves from here. */
  it("resolves a thread in place", () => {
    mockComments = [comment("c1", "pg001_sec001")]
    render(<PublishingRecentFeedback bookLabel="raven" />)

    screen.getByTestId("publish-feedback-resolve").click()
    expect(resolveMutate).toHaveBeenCalledWith({ id: "c1", resolved: true })
  })
})
