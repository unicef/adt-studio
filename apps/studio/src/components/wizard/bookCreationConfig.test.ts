import { describe, expect, it, vi } from "vitest"

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }),
}))

const { buildConfigOverrides } = await import("./bookCreationConfig")
const { defaultWizardValues } = await import("./wizardForm")

describe("buildConfigOverrides", () => {
  it("stores the selected generation model as a book-level override", () => {
    const config = buildConfigOverrides({
      ...defaultWizardValues,
      generationModel: "local:gemma4-e4b",
    })

    expect(config.default_model).toBe("local:gemma4-e4b")
  })

  it("does not persist an empty generation model", () => {
    const config = buildConfigOverrides(defaultWizardValues)

    expect(config).not.toHaveProperty("default_model")
  })
})
