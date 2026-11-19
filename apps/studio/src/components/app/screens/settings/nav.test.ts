import { afterEach, describe, expect, it, vi } from "vitest"
import type { I18n } from "@lingui/core"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    return { id: strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), "") }
  },
}))

const i18n = { _: (value: { id: string } | string) => (typeof value === "string" ? value : value.id) } as unknown as I18n

async function loadFor(version: string | undefined) {
  vi.resetModules()
  vi.stubGlobal("window", { api: version ? { version } : undefined })
  const nav = await import("./nav")
  const search = await import("./searchIndex")
  const tabs = nav.visibleSettingsGroups().flatMap((group) => group.tabs.map((tab) => tab.key))
  const sections = search
    .buildSettingsSearchItems(i18n, search.SETTINGS_SEARCH_ENTRIES)
    .map((item) => item.section)
  return { nav, tabs, sections }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Versions settings tab", () => {
  it.each([
    ["the web build", undefined],
    ["a stable desktop build", "0.8.0"],
  ])("is absent in %s", async (_name, version) => {
    const { nav, tabs, sections } = await loadFor(version)
    expect(tabs).not.toContain("versions")
    expect(sections).not.toContain("versions")
    expect(nav.isSettingsSectionAvailable("versions")).toBe(false)
    expect(tabs).toContain("about")
  })

  it.each([
    ["a numbered beta", "0.8.0-beta.1"],
    ["a preview build", "0.8.1-beta-pr-867"],
  ])("is present in %s", async (_name, version) => {
    const { nav, tabs, sections } = await loadFor(version)
    expect(tabs).toContain("versions")
    expect(sections).toContain("versions")
    expect(nav.isSettingsSectionAvailable("versions")).toBe(true)
  })
})
