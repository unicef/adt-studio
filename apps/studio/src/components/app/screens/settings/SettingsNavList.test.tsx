// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

let rejected: { providerId: string; displayName: string } | null = null
let needsProvider = false
let sharingUpdate: object | null = null

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }),
}))
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    i18n: { _: (descriptor: { id: string }) => descriptor.id },
    t: (strings: TemplateStringsArray) => strings.join(""),
  }),
}))
vi.mock("@/hooks/use-api-key", () => ({
  useRejectedTextProvider: () => rejected,
  useNeedsTextProvider: () => needsProvider,
}))
vi.mock("@/hooks/use-sharing-update", () => ({ useSharingUpdate: () => sharingUpdate }))

const { SettingsNavList } = await import("./SettingsNavList")

const tab = (label: string) => screen.getByText(label).closest("a") as HTMLElement

describe("SettingsNavList", () => {
  afterEach(() => {
    cleanup()
    rejected = null
    needsProvider = false
    sharingUpdate = null
  })

  it("flags the AI providers tab while no provider is connected", () => {
    needsProvider = true
    render(<SettingsNavList activeKey="language" />)
    expect(within(tab("AI providers")).getByText("Not connected")).toBeTruthy()
    expect(screen.queryByText("Key rejected")).toBeNull()
  })

  it("flags the AI providers tab while a provider refuses its key", () => {
    rejected = { providerId: "openai", displayName: "OpenAI" }
    render(<SettingsNavList activeKey="language" />)
    expect(within(tab("AI providers")).getByText("Key rejected")).toBeTruthy()
  })

  it("shows no flag when every key is accepted", () => {
    render(<SettingsNavList activeKey="language" />)
    expect(screen.queryByText("Key rejected")).toBeNull()
    expect(screen.queryByText("Not connected")).toBeNull()
  })

  it("keeps the sharing update badge independent of the key flag", () => {
    rejected = { providerId: "openai", displayName: "OpenAI" }
    sharingUpdate = {}
    render(<SettingsNavList activeKey="language" />)
    expect(within(tab("AI providers")).getByText("Key rejected")).toBeTruthy()
    expect(screen.getAllByText("Update")).toHaveLength(1)
  })
})
