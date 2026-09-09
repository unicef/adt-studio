import { describe, expect, it, vi } from "vitest"
import { PIPELINE } from "@adt/types"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) {
        text += String(values[index])
      }
    }
    return { id: text }
  },
}))

vi.mock("@lingui/core", () => ({
  i18n: {
    _(descriptor: { id?: string } | string) {
      return typeof descriptor === "string" ? descriptor : (descriptor.id ?? "")
    },
  },
}))

const {
  getStageDescriptionI18n,
  getStageLabelI18n,
  getStageRunningLabelI18n,
  getStepLabelI18n,
  STEP_LABEL_MESSAGES,
} = await import("./pipeline-i18n")

describe("pipeline-i18n", () => {
  it("returns validation stage labels", () => {
    expect(getStageLabelI18n("validation")).toBe("Validation")
    expect(getStageRunningLabelI18n("validation")).toBe("Running Validation...")
    expect(getStageDescriptionI18n("validation")).toBe(
      "Run whole-book validation checks and configure accessibility assessment settings.",
    )
  })

  it("falls back safely for unknown stages", () => {
    expect(getStageLabelI18n("unknown-stage")).toBe("unknown-stage")
    expect(getStageRunningLabelI18n("unknown-stage")).toBe("unknown-stage")
    expect(getStageDescriptionI18n("unknown-stage")).toBeUndefined()
  })

  it("resolves labels for every pipeline step", () => {
    expect(getStepLabelI18n("core-tts-catalog")).toBe("TTS Normalization")
    expect(getStepLabelI18n("accessibility-assessment")).toBe("Accessibility Assessment")
    expect(Object.keys(STEP_LABEL_MESSAGES).sort()).toEqual(
      PIPELINE.flatMap((stage) => stage.steps.map((step) => step.name)).sort(),
    )
  })
})
