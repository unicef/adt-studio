import { describe, it, expect, vi } from "vitest"
import { STEP_WARNING_KINDS, type StepWarning, type StepWarningKind } from "@adt/types"

// The Lingui macros are compile-time; the root vitest config does not load the
// plugin, so stand them in the way the other studio unit tests do.
vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray | { message: string }, ...values: unknown[]) {
    if (!Array.isArray(strings)) return { id: (strings as { message: string }).message }
    let text = ""
    for (let i = 0; i < strings.length; i += 1) {
      text += strings[i]
      if (i < values.length) text += String(values[i])
    }
    return { id: text }
  },
  plural(count: number, forms: { one: string; other: string }) {
    return (count === 1 ? forms.one : forms.other).replace("#", String(count))
  },
}))

const { describeStepWarning } = await import("./step-warnings")

const i18n = { _: (d: { id?: string }) => d.id ?? "" } as never

const SAMPLES: Record<StepWarningKind, StepWarning> = {
  "pages-skipped": { kind: "pages-skipped", count: 2 },
  "pages-unchanged": { kind: "pages-unchanged", pages: [{ pageId: "pg002", error: "HTTP 500" }] },
  "summary-missing": { kind: "summary-missing", error: "The model does not exist" },
  "source-assessment": { kind: "source-assessment", warning: 2, critical: 1 },
}

describe("describeStepWarning", () => {
  it("AC-26: every step warning kind renders a translated summary", () => {
    for (const kind of STEP_WARNING_KINDS) {
      expect(describeStepWarning(SAMPLES[kind], i18n).summary, kind).not.toBe("")
    }
  })

  it("lists at most five pages with their error, then how many more", () => {
    const pages = Array.from({ length: 7 }, (_, index) => ({ pageId: `pg00${index + 1}`, error: "HTTP 500" }))
    const text = describeStepWarning({ kind: "pages-unchanged", pages }, i18n)
    expect(text.summary).toBe("7 pages kept their extracted images unchanged because the model call failed.")
    expect(text.details).toEqual(["pg001: HTTP 500", "pg002: HTTP 500", "pg003: HTTP 500", "pg004: HTTP 500", "pg005: HTTP 500", "… and 2 more"])
  })

  it("keeps provider error text verbatim and counts skipped pages", () => {
    expect(describeStepWarning(SAMPLES["summary-missing"], i18n).details).toEqual(["The model does not exist"])
    expect(describeStepWarning({ kind: "pages-skipped", count: 1 }, i18n).summary).toBe("1 page was skipped after it failed.")
  })
})
