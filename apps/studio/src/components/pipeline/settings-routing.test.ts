import { describe, expect, it } from "vitest"
import { resolveSettingsStageSlug, SETTINGS_STAGE_SLUGS } from "./settings-routing"

describe("settings-routing", () => {
  it("includes validation as a settings-backed stage", () => {
    expect(SETTINGS_STAGE_SLUGS).toContain("validation")
    expect(resolveSettingsStageSlug("validation")).toBe("validation")
  })

  it("resolves known settings stages", () => {
    expect(resolveSettingsStageSlug("extract")).toBe("extract")
    expect(resolveSettingsStageSlug("translate")).toBe("translate")
    expect(resolveSettingsStageSlug("easy-read")).toBe("easy-read")
    expect(resolveSettingsStageSlug("speech")).toBe("speech")
  })

  it("returns null for stages without settings views", () => {
    expect(resolveSettingsStageSlug("book")).toBeNull()
    expect(resolveSettingsStageSlug("not-a-stage")).toBeNull()
  })

  it("resolves preview and export — they expose an Overview tab", () => {
    expect(resolveSettingsStageSlug("preview")).toBe("preview")
    expect(resolveSettingsStageSlug("export")).toBe("export")
  })
})
