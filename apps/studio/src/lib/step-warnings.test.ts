import { describe, it, expect, vi } from "vitest"
import { STEP_WARNING_KINDS, type StepWarningKind, type StepWarningView } from "@adt/types"

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

const { describeStepWarning, legacyCompletionNote } = await import("./step-warnings")

const i18n = { _: (d: { id?: string }) => d.id ?? "" } as never

const SAMPLES: Record<StepWarningKind | "unrecognized", StepWarningView> = {
  "pages-skipped": { kind: "pages-skipped", count: 2 },
  "pages-unchanged": { kind: "pages-unchanged", pages: [{ pageId: "pg002", error: "HTTP 500" }] },
  "summary-missing": { kind: "summary-missing", error: "The model does not exist" },
  "source-assessment": { kind: "source-assessment", warning: 2, critical: 1, incompletePages: 0 },
  unrecognized: { kind: "unrecognized", count: 2 },
}

describe("describeStepWarning", () => {
  it("AC-26: every step warning kind, and an unrecognized one, renders a translated summary", () => {
    for (const kind of [...STEP_WARNING_KINDS, "unrecognized" as const]) {
      expect(describeStepWarning(SAMPLES[kind], i18n).summary, kind).not.toBe("")
    }
  })

  it("lists at most five page ids, then how many more, and keeps the provider text as technical details", () => {
    const pages = Array.from({ length: 7 }, (_, index) => ({ pageId: `pg00${index + 1}`, error: index === 6 ? "timeout" : "HTTP 500" }))
    const text = describeStepWarning({ kind: "pages-unchanged", pages }, i18n)
    expect(text.summary).toBe("7 pages kept their extracted images unchanged because the model call failed.")
    expect(text.details).toEqual(["pg001", "pg002", "pg003", "pg004", "pg005", "… and 2 more"])
    expect(text.technical).toEqual(["HTTP 500", "timeout"])
  })

  it("puts a missing summary's provider text in technical details, truncated to the contract's 120 characters", () => {
    expect(describeStepWarning(SAMPLES["summary-missing"], i18n)).toMatchObject({ details: [], technical: ["The model does not exist"] })
    const long = "x".repeat(200)
    expect(describeStepWarning({ kind: "summary-missing", error: long }, i18n).technical[0]).toHaveLength(120)
  })

  it("counts skipped pages and, for AC-30, lists them like unchanged pages", () => {
    expect(describeStepWarning({ kind: "pages-skipped", count: 1 }, i18n)).toMatchObject({ summary: "1 page was skipped after it failed.", details: [] })
    const pageIds = Array.from({ length: 6 }, (_, index) => `pg00${index + 1}`)
    expect(describeStepWarning({ kind: "pages-skipped", count: 6, pageIds }, i18n).details)
      .toEqual(["pg001", "pg002", "pg003", "pg004", "pg005", "… and 1 more"])
  })

  it("says when the source assessment could not run every check, alone when it found nothing", () => {
    expect(describeStepWarning({ kind: "source-assessment", warning: 1, critical: 0, incompletePages: 3 }, i18n)).toMatchObject({
      summary: "The source PDF assessment found 1 issue to check.",
      details: ["Not fully assessed on 3 pages."],
    })
    expect(describeStepWarning({ kind: "source-assessment", warning: 0, critical: 0, incompletePages: 1 }, i18n)).toMatchObject({
      summary: "Not fully assessed on 1 page.",
      details: [],
    })
  })

  it("explains warnings this version cannot show, and a completion by an older version", () => {
    expect(describeStepWarning({ kind: "unrecognized", count: 2 }, i18n).summary)
      .toBe("2 warnings this version of ADT Studio can't show; open the book in a newer version.")
    expect(legacyCompletionNote(i18n)).toBe("Completed by an older version of ADT Studio; it may not have recorded every warning.")
  })
})
