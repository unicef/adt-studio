import { describe, it, expect } from "vitest"
import {
  isProviderOptionDisabled,
  type ProviderKeyAvailability,
} from "./provider-availability"

const onlyOpenAI: ProviderKeyAvailability = {
  openai: true,
  azure: false,
  gemini: false,
  elevenlabs: false,
}

describe("isProviderOptionDisabled", () => {
  it("enables a provider whose key is present", () => {
    expect(isProviderOptionDisabled("openai", "openai", onlyOpenAI)).toBe(false)
    expect(isProviderOptionDisabled("openai", "azure", onlyOpenAI)).toBe(false)
  })

  it("disables a provider with no key", () => {
    expect(isProviderOptionDisabled("elevenlabs", "openai", onlyOpenAI)).toBe(true)
    expect(isProviderOptionDisabled("azure", "openai", onlyOpenAI)).toBe(true)
    expect(isProviderOptionDisabled("gemini", "openai", onlyOpenAI)).toBe(true)
  })

  it("keeps the currently saved provider selectable even with no key", () => {
    // An imported book carries its speech config but not the author's keys, so
    // the saved provider must stay visible and re-selectable rather than being
    // greyed out of the user's own configuration.
    expect(isProviderOptionDisabled("elevenlabs", "elevenlabs", onlyOpenAI)).toBe(false)
  })

  it("disables everything but the current provider when no keys are held", () => {
    const none: ProviderKeyAvailability = {
      openai: false,
      azure: false,
      gemini: false,
      elevenlabs: false,
    }
    expect(isProviderOptionDisabled("gemini", "gemini", none)).toBe(false)
    for (const other of ["openai", "azure", "elevenlabs"]) {
      expect(isProviderOptionDisabled(other, "gemini", none)).toBe(true)
    }
  })

  it("treats an unknown provider id as unavailable", () => {
    expect(isProviderOptionDisabled("not-a-provider", "openai", onlyOpenAI)).toBe(true)
  })
})
