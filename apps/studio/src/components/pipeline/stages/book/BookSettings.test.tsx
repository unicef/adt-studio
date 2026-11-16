// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The book's API keys screen shows the Settings provider cards inline; the
 * cards themselves (save, live check, rejected key) are covered by
 * ProvidersList.test.
 */

const store = { isLoading: false, isError: false }
type GroupsProps = { store: unknown; openId: string | null; linkedCard?: string | null; bookLabel?: string }
const groupsProps: GroupsProps[] = []
let location = { hash: "" }

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => location,
  useSearch: () => ({ tab: "general" }),
}))
vi.mock("@/components/app/screens/settings/providers/useProviders", () => ({
  useProviders: () => store,
}))
vi.mock("@/components/app/screens/settings/providers/ProviderCardGroups", () => ({
  ProviderCardGroups: (props: { store: unknown; openId: string | null; onToggle: (cardKey: string) => void }) => {
    groupsProps.push(props)
    return (
      <button type="button" onClick={() => props.onToggle("openai")}>
        {props.openId === "openai" ? "openai-card-open" : "openai-card"}
      </button>
    )
  },
}))
vi.mock("./BookModelSettings", () => ({ BookModelSettings: () => <div>model-settings</div> }))

const { BookSettings } = await import("./BookSettings")

afterEach(() => {
  cleanup()
  groupsProps.length = 0
  location = { hash: "" }
})

describe("BookSettings", () => {
  it("shows the same provider cards as Settings → AI providers on the API keys screen", () => {
    render(<BookSettings bookLabel="book" />)

    expect(screen.getByText("API keys")).toBeTruthy()
    expect(groupsProps[0]?.store).toBe(store)
    // Cards expand one at a time, like the Settings page.
    fireEvent.click(screen.getByRole("button", { name: "openai-card" }))
    fireEvent.click(screen.getByRole("button", { name: "openai-card-open" }))
    expect(screen.getByRole("button", { name: "openai-card" })).toBeTruthy()
  })

  // A "key rejected" link (the book's settings cog) lands on the provider's
  // card, expanded.
  it("opens the card a link points at", () => {
    location = { hash: "settings-provider-anthropic" }
    render(<BookSettings bookLabel="book" />)
    const last = groupsProps.at(-1)!
    expect(last.openId).toBe("anthropic")
    expect(last.linkedCard).toBe("anthropic")
  })

  it("ignores a link to a card that doesn't exist", () => {
    location = { hash: "settings-provider-nope" }
    render(<BookSettings bookLabel="book" />)
    expect(groupsProps.at(-1)!.openId).toBeNull()
  })

  it("says the keys are shared with every book, and points the cards at this book", () => {
    render(<BookSettings bookLabel="book" />)
    expect(screen.getByText(/shared with Settings → AI providers and apply to every book/)).toBeTruthy()
    expect(groupsProps[0]?.bookLabel).toBe("book")
  })

  it("keeps the models tab separate", () => {
    render(<BookSettings bookLabel="book" tab="models" />)
    expect(screen.getByText("model-settings")).toBeTruthy()
    expect(groupsProps).toHaveLength(0)
  })
})
