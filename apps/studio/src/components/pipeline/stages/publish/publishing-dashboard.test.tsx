// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { BookPublicationVersionRecord } from "@/api/client"

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

/** The failure notice links into Settings, and a bare `Link` outside a router throws. */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { PublishingFreshness } = await import("./PublishingFreshness")
const { PublishingInvitation } = await import("./PublishingInvitation")
const { PublishingUpdateTakeover } = await import("./PublishingUpdateTakeover")

function version(overrides: Partial<BookPublicationVersionRecord> = {}): BookPublicationVersionRecord {
  return {
    version: 3,
    published_at: "2026-08-04T10:00:00.000Z",
    page_count: 24,
    content_revision: 40,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PublishingFreshness", () => {
  it("says readers are current when nothing has been written since the publish", () => {
    render(<PublishingFreshness contentRevision={40} liveVersion={version()} />)
    expect(screen.getByTestId("publish-freshness-current")).toBeTruthy()
  })

  it("warns when the book has moved on", () => {
    render(<PublishingFreshness contentRevision={41} liveVersion={version()} />)
    expect(screen.getByTestId("publish-freshness-stale")).toBeTruthy()
    expect(document.body.textContent).toContain("readers are seeing an older copy")
  })

  /**
   * The load-bearing case. A version published before revisions were recorded knows nothing, and
   * saying "up to date" there would be a guess about the one fact the author is relying on.
   */
  it("admits it cannot tell rather than claiming the link is current", () => {
    render(<PublishingFreshness contentRevision={40} liveVersion={version({ content_revision: null })} />)
    expect(screen.getByTestId("publish-freshness-unknown")).toBeTruthy()
    expect(screen.queryByTestId("publish-freshness-current")).toBeNull()

    cleanup()
    render(<PublishingFreshness contentRevision={null} liveVersion={version()} />)
    expect(screen.getByTestId("publish-freshness-unknown")).toBeTruthy()
  })
})

describe("PublishingInvitation", () => {
  const URL = "https://adt-publish.example.workers.dev/p/abcdefghijklmnopqrstuvwxyz012345/"

  it("composes a message with the link, the code and the end date", () => {
    render(
      <PublishingInvitation
        title="Raven and the Sun"
        url={URL}
        accessCode="3MAKEX"
        expiresAt="2026-09-12T00:00:00.000Z"
      />,
    )
    const text = screen.getByTestId("publish-invitation-preview").textContent ?? ""
    expect(text).toContain("Raven and the Sun is ready to read.")
    expect(text).toContain(`Open: ${URL}`)
    expect(text).toContain("Access code: 3MAKEX")
    expect(text).toContain("stops working on")
  })

  /** Promising a code in a message that has none would send a class to a door they cannot open. */
  it("leaves out the code line when the link needs no code", () => {
    render(
      <PublishingInvitation title="Raven" url={URL} accessCode={null} expiresAt={null} />,
    )
    const text = screen.getByTestId("publish-invitation-preview").textContent ?? ""
    expect(text).not.toContain("Access code")
    expect(text).not.toContain("stops working")
    expect(document.body.textContent).toContain("Anyone with the link can open it")
  })

  it("copies exactly the text it is showing", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })

    render(
      <PublishingInvitation title="Raven" url={URL} accessCode="3MAKEX" expiresAt={null} />,
    )
    const shown = screen.getByTestId("publish-invitation-preview").textContent
    fireEvent.click(screen.getByRole("button", { name: /copy this message/i }))
    expect(writeText).toHaveBeenCalledWith(shown)
  })
})

describe("PublishingUpdateTakeover", () => {
  function run(overrides: Record<string, unknown> = {}) {
    return {
      status: "running",
      kind: "update",
      stepStates: ["done", "running", "pending", "pending"],
      activeStep: 2,
      failure: null,
      result: null,
      publish: vi.fn(),
      update: vi.fn(),
      reset: vi.fn(),
      ...overrides,
    } as never
  }

  /** One step at a time tells an author nothing about how much is left, and this is exactly the
   *  wait where somebody starts wondering whether it has hung. */
  it("shows all four steps at once, not only the running one", () => {
    render(
      <PublishingUpdateTakeover title="Raven" fromVersion={7} run={run()} elapsedMs={12_000} />,
    )
    const list = screen.getByRole("list")
    expect(list.querySelectorAll("li")).toHaveLength(4)
    expect(document.body.textContent).toContain("1 of 4")
    expect(document.body.textContent).toContain("readers stay on version 7")
  })

  it("keeps the author's readers out of it when a run fails, and offers a retry", () => {
    const failed = run({
      status: "error",
      stepStates: ["done", "done", "error", "pending"],
      failure: { code: "upload_failed", message: "boom", stepId: "upload", resumeStep: null },
    })
    render(
      <PublishingUpdateTakeover title="Raven" fromVersion={7} run={failed} elapsedMs={4_000} />,
    )
    expect(document.body.textContent).toContain("Nothing changed for your readers")
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy()
  })
})
