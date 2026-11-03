import { describe, it, expect, vi, beforeEach } from "vitest"

// The Lingui macros are compile-time; the root vitest config does not load the
// plugin, so stand them in the way the other studio unit tests do.
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

const { warningToast } = vi.hoisted(() => ({ warningToast: vi.fn() }))
vi.mock("sonner", () => ({ toast: { warning: warningToast } }))

const { readPackagingWarnings, toastPackagingWarnings, describePackagingWarnings } = await import("./packaging-warnings")

const i18n = { _: (d: { id?: string }) => d.id ?? "" } as never
const orphan = { kind: "orphaned-rendering", pageId: "pg002", sectionIndex: 1 }

it.each(["missing-storyboard", "orphaned-rendering"] as const)("bounds %s page identities without losing total counts or raw warnings", kind => {
  const warnings = Array.from({ length: 27 }, (_, index) => ({ kind, pageId: `pg${String(index + 1).padStart(3, "0")}`, sectionIndex: 0 }))
  const duplicate = { ...warnings[0], sectionIndex: 1 }
  const raw = [...warnings, duplicate]
  const message = describePackagingWarnings(raw, i18n)!
  expect(message).toContain("27 page")
  expect(message).toContain("showing up to 20")
  expect(message).toContain("pg001")
  expect(message).toContain("pg020")
  expect(message).not.toContain("pg021")
  if (kind === "orphaned-rendering") expect(message).toContain("28 rendered section")
  expect(readPackagingWarnings({ warnings: raw })).toHaveLength(28)
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("readPackagingWarnings", () => {
  it("reads warnings off a task result or a synchronous response alike", () => {
    // Both channels carry the same field; the caller should not have to know
    // which one answered.
    expect(readPackagingWarnings({ warnings: [orphan] })).toEqual([orphan])
    expect(readPackagingWarnings({ status: "completed", warnings: [orphan] })).toEqual([orphan])
  })

  it("returns nothing rather than throwing on results that carry no warnings", () => {
    // Older task records and task kinds that never had the field.
    expect(readPackagingWarnings(undefined)).toEqual([])
    expect(readPackagingWarnings(null)).toEqual([])
    expect(readPackagingWarnings({})).toEqual([])
    expect(readPackagingWarnings({ warnings: "not-an-array" })).toEqual([])
  })
})

describe("toastPackagingWarnings", () => {
  it("names the affected pages when something was left out", () => {
    toastPackagingWarnings({ warnings: [orphan] }, i18n)

    expect(warningToast).toHaveBeenCalledTimes(1)
    expect(String(warningToast.mock.calls[0][0])).toContain("pg002")
  })

  it("stays silent on a clean run", () => {
    toastPackagingWarnings({ warnings: [] }, i18n)
    toastPackagingWarnings({ status: "completed" }, i18n)

    expect(warningToast).not.toHaveBeenCalled()
  })
})

it("shares the twenty-page display budget across combined warning categories", () => {
  const warnings = Array.from({ length: 21 }, (_, i) => ({ kind: "missing-storyboard" as const, pageId: `missing${i}`, sectionIndex: 0 }))
  const orphaned = Array.from({ length: 21 }, (_, i) => ({ kind: "orphaned-rendering" as const, pageId: `orphan${i}`, sectionIndex: 0 }))
  const text = describePackagingWarnings([...warnings, ...orphaned], i18n)!
  expect(text.match(/(?:missing|orphan)\d+/g)).toHaveLength(20)
  expect(text).toContain("21 rendered section")
  expect(text).toContain("21 page")
})
