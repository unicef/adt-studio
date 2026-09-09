// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { I18n } from "@lingui/core"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let i = 0; i < strings.length; i += 1) {
      text += strings[i]
      if (i < values.length) text += String(values[i])
    }
    return { id: text }
  },
}))

const goToLibrary = vi.fn()
const deps = { goToLibrary }

const i18n = {
  _: (d: { id?: string } | string) => (typeof d === "string" ? d : (d.id ?? "")),
} as unknown as I18n

async function load() {
  vi.resetModules()
  const [{ buildQuickActions }, { readThemeMode }, { getLibraryPrefs }] = await Promise.all([
    import("./quick-actions"),
    import("@/lib/theme"),
    import("@/hooks/use-library-prefs"),
  ])
  return { buildQuickActions, readThemeMode, getLibraryPrefs, i18n }
}

beforeEach(() => {
  window.localStorage.clear()
  goToLibrary.mockClear()
  document.documentElement.classList.remove("dark")
})

afterEach(() => {
  window.localStorage.clear()
})

describe("palette quick actions", () => {
  it("offers the opposite theme, and applies it", async () => {
    const { buildQuickActions, readThemeMode } = await load()
    const toggle = buildQuickActions(i18n, deps).find((a) => a.id === "qa-theme-toggle")!
    expect(toggle.title).toBe("Switch to dark theme")
    toggle.run()
    expect(readThemeMode()).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    const back = buildQuickActions(i18n, deps).find((a) => a.id === "qa-theme-toggle")!
    expect(back.title).toBe("Switch to light theme")
  })

  it("ticks the value a setting already holds", async () => {
    const { buildQuickActions } = await load()
    const grid = buildQuickActions(i18n, deps).find((a) => a.id === "qa-view-grid")!
    grid.run()
    const rebuilt = buildQuickActions(i18n, deps)
    expect(rebuilt.find((a) => a.id === "qa-view-grid")!.active).toBe(true)
    expect(rebuilt.find((a) => a.id === "qa-view-list")!.active).toBe(false)
  })

it("takes the reader to the Library, where a library change is visible", async () => {
    const { buildQuickActions, getLibraryPrefs } = await load()
    const actions = buildQuickActions(i18n, deps)
    actions.find((a) => a.id === "qa-sort-title")!.run()
    expect(getLibraryPrefs().sort).toBe("title")
    expect(goToLibrary).toHaveBeenCalledTimes(1)
  })

  it("stays where it is for theme and language, which are visible in place", async () => {
    const { buildQuickActions } = await load()
    const actions = buildQuickActions(i18n, deps)
    actions.find((a) => a.id === "qa-theme-toggle")!.run()
    actions.find((a) => a.id === "qa-locale-pt-BR")!.run()
    expect(goToLibrary).not.toHaveBeenCalled()
  })

  it("names every language in its own tongue", async () => {
    const { buildQuickActions } = await load()
    const titles = buildQuickActions(i18n, deps)
      .filter((a) => a.id.startsWith("qa-locale-"))
      .map((a) => a.title)
    expect(titles).toEqual(["English", "Português (Brasil)", "Español", "Français", "Shqip"])
  })

  it("covers every bounded value exactly once", async () => {
    const { buildQuickActions } = await load()
    const ids = buildQuickActions(i18n, deps).map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id.startsWith("qa-locale-"))).toHaveLength(5)
    expect(ids.filter((id) => id.startsWith("qa-sort-"))).toHaveLength(5)
    expect(ids.filter((id) => id.startsWith("qa-view-"))).toHaveLength(2)
    expect(ids.filter((id) => id.startsWith("qa-group-"))).toHaveLength(2)
    expect(ids).toHaveLength(16)
  })
})
