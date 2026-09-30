import { describe, expect, it, vi } from "vitest"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) text += String(values[index])
    }
    return { id: text }
  },
}))

const { providerAnchor, providerFromAnchor } = await import("./nav")
const { PROVIDER_IDS } = await import("./providerSearchMeta")
const { PROVIDER_CARDS } = await import("./providers/data")
const { SETTINGS_SEARCH_ENTRIES } = await import("./searchIndex")

describe("provider anchors", () => {
  it("round-trips every searchable provider id", () => {
    for (const id of PROVIDER_IDS) {
      expect(providerFromAnchor(providerAnchor(id))).toBe(id)
    }
  })

  it("ignores anchors belonging to other settings sections", () => {
    expect(providerFromAnchor("settings-locale-pt-BR")).toBeNull()
    expect(providerFromAnchor("settings-default-llm")).toBeNull()
  })

  it("points every provider search entry at a card the providers screen renders", () => {
    const providerEntries = SETTINGS_SEARCH_ENTRIES.filter(
      (entry) => entry.section === "providers" && providerFromAnchor(entry.anchor ?? "") !== null,
    )
    expect(providerEntries.length).toBe(PROVIDER_IDS.length)

    const orphans = providerEntries
      .map((entry) => providerFromAnchor(entry.anchor ?? ""))
      .filter((cardKey) => !cardKey || !PROVIDER_CARDS[cardKey])
    expect(orphans).toEqual([])
  })
})
