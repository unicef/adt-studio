import { describe, expect, it } from "vitest"
import { normalizeSettingsSection } from "./settingsSections"

describe("normalizeSettingsSection", () => {
  it.each(["default-model", "api-keys", "prompts"] as const)(
    "keeps the supported %s section",
    (section) => {
      expect(normalizeSettingsSection(section)).toBe(section)
    },
  )

  it("falls back to default model settings for unknown values", () => {
    expect(normalizeSettingsSection("unknown")).toBe("default-model")
    expect(normalizeSettingsSection(undefined)).toBe("default-model")
  })
})
