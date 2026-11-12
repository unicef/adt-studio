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
const groupsProps: Array<{ store: unknown }> = []

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

  it("keeps the models tab separate", () => {
    render(<BookSettings bookLabel="book" tab="models" />)
    expect(screen.getByText("model-settings")).toBeTruthy()
    expect(groupsProps).toHaveLength(0)
  })
})
