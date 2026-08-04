// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { PublishComment } from "@/api/client"
import { buildThreads } from "./lib/threads"

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

const { ThreadRow } = await import("./ThreadRow")

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345"

function comment(overrides: Partial<PublishComment> & { id: string }): PublishComment {
  return {
    token: TOKEN,
    version: 2,
    page_section_id: "pg001_sec001",
    parent_id: null,
    session_id: "session-maria",
    author_name: "Maria",
    author_color: "#e5484d",
    body: "Look at this bit",
    anchor: { selector: '#content [data-id="a"]', xOffsetPct: 50, yOffsetPct: 50 },
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T10:00:00.000Z",
    ...overrides,
  }
}

function renderRow(
  root: PublishComment,
  options: { pinMissing?: boolean; pinNumber?: number } = {},
) {
  const thread = buildThreads([root])[0]!
  return render(
    <ul>
      <ThreadRow
        thread={thread}
        pinNumber={options.pinNumber ?? 3}
        currentVersion={2}
        pinMissing={options.pinMissing ?? false}
        expanded={false}
        authorSessionId={`author-${TOKEN}`}
        onSelect={() => {}}
        onReply={async () => {}}
        onResolve={async () => {}}
        onEdit={async () => {}}
        onDelete={async () => {}}
        busy={false}
      />
    </ul>,
  )
}

afterEach(cleanup)

describe("ThreadRow markers", () => {
  it("shows the pin number for a pin that is on the page", () => {
    const { container } = renderRow(comment({ id: "c1" }))
    expect(container.textContent).toContain("3")
    expect(screen.queryByText("Pin not on this version")).toBeNull()
  })

  it("drops the number and says so when the anchor is not on this version", () => {
    const { container } = renderRow(comment({ id: "c1" }), { pinMissing: true })
    expect(screen.getByText("Pin not on this version")).toBeTruthy()
    expect(container.textContent).toContain("–")
    expect(container.textContent).not.toContain("3")
  })

  it("marks a whole-page comment with a dot instead of a number", () => {
    const { container } = renderRow(comment({ id: "c1", anchor: null }))
    expect(screen.getByText("Whole page")).toBeTruthy()
    expect(container.textContent).toContain("•")
  })

  it("shows a version chip only for a thread from an older version", () => {
    renderRow(comment({ id: "c1", version: 1 }))
    expect(screen.getByText("v1")).toBeTruthy()
    cleanup()
    renderRow(comment({ id: "c2", version: 2 }))
    expect(screen.queryByText("v2")).toBeNull()
  })

  it("collapses a deleted comment into a placeholder", () => {
    renderRow(comment({ id: "c1", deleted_at: "2026-08-04T12:00:00.000Z" }))
    expect(screen.getByText("This comment was deleted")).toBeTruthy()
    expect(screen.queryByText("Look at this bit")).toBeNull()
  })
})
