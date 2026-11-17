// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The Settings link at the foot of the app sidebar: where it leads and what it
 * says while the text provider needs attention.
 */

type ProviderRef = { providerId: string; displayName: string }
let rejected: ProviderRef | null = null
let missing: ProviderRef | null = null
let sharingUpdate: object | null = null

const interpolate = (strings: TemplateStringsArray, values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ id: interpolate(strings, values) }),
  select: (_value: string, cases: { other: string }) => cases.other,
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    i18n: { _: (descriptor: { id: string }) => descriptor.id },
    t: (strings: TemplateStringsArray | { message: string }, ...values: unknown[]) =>
      Array.isArray(strings) ? interpolate(strings as TemplateStringsArray, values) : (strings as { message: string }).message,
  }),
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search, hash, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; search?: { auth?: string }; hash?: string }) => (
    <a data-to={to} data-auth={search?.auth} data-hash={hash} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => vi.fn(),
}))
vi.mock("@/components/updates", () => ({ useUpdateDialog: () => ({ showWhatsNew: vi.fn() }) }))
vi.mock("./SidebarLogo", () => ({ SidebarLogo: () => null }))
vi.mock("@/hooks/use-sharing-update", () => ({ useSharingUpdate: () => sharingUpdate }))
vi.mock("@/hooks/use-api-key", () => ({
  useRejectedTextProvider: () => rejected,
  useMissingTextProvider: () => missing,
  useNeedsTextProvider: () => missing !== null,
}))

const { AppSidebar } = await import("./AppSidebar")

function settingsLink(): HTMLElement {
  return screen.getByText("Settings").closest("a") as HTMLElement
}

function renderSidebar() {
  render(<AppSidebar libraryCount={0} handoffsCount={0} onOpenPalette={() => {}} onOpenAdd={() => {}} onOpenShortcuts={() => {}} />)
}

afterEach(() => {
  cleanup()
  rejected = null
  missing = null
  sharingUpdate = null
})

describe("AppSidebar — Settings link", () => {
  it("opens the card of the default text model's provider when it isn't set up", () => {
    missing = { providerId: "anthropic", displayName: "Anthropic" }
    renderSidebar()
    const link = settingsLink()
    expect(link.getAttribute("data-to")).toBe("/settings/providers")
    expect(link.getAttribute("data-auth")).toBe("api-key")
    expect(link.getAttribute("data-hash")).toBe("settings-provider-anthropic")
    const label = "Settings — the default AI provider isn't set up (Anthropic)"
    expect(link.getAttribute("aria-label")).toBe(label)
    // The dot is colour only; the tooltip says what it means.
    expect(link.getAttribute("title")).toBe(label)
  })

  it("opens the hosting card for a CLI backend (Claude Agent lives on the Anthropic card)", () => {
    missing = { providerId: "claude-agent", displayName: "Claude Agent" }
    renderSidebar()
    expect(settingsLink().getAttribute("data-hash")).toBe("settings-provider-anthropic")
    // It signs in through the CLI, so the card isn't forced onto its API-key tab.
    expect(settingsLink().getAttribute("data-auth")).toBeNull()
  })

  it("names and opens the provider that refused its key", () => {
    rejected = { providerId: "openai", displayName: "OpenAI" }
    missing = null
    renderSidebar()
    const link = settingsLink()
    expect(link.getAttribute("data-hash")).toBe("settings-provider-openai")
    expect(link.getAttribute("aria-label")).toBe("Settings — the OpenAI key was rejected")
    expect(link.getAttribute("title")).toBe("Settings — the OpenAI key was rejected")
  })

  it("is a plain Settings link when nothing is waiting", () => {
    renderSidebar()
    const link = settingsLink()
    expect(link.getAttribute("data-to")).toBe("/settings")
    expect(link.getAttribute("data-hash")).toBeNull()
    expect(link.getAttribute("aria-label")).toBeNull()
    expect(link.getAttribute("title")).toBeNull()
  })
})
