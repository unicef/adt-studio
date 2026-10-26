import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let i = 0; i < strings.length; i += 1) {
      text += strings[i]
      if (i < values.length) text += String(values[i])
    }
    return { id: text }
  },
  plural: (n: number) => String(n),
}))
vi.mock("@lingui/core", () => ({
  i18n: { _: (d: { id?: string } | string) => (typeof d === "string" ? d : (d.id ?? "")) },
}))

const { formatRelative } = await import("./data")

const NOW = new Date("2026-08-31T12:00:00.000Z").getTime()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function ago(ms: number): string {
  vi.setSystemTime(NOW)
  return formatRelative(new Date(NOW - ms).toISOString(), "en-US")
}

afterEach(() => {
  vi.useRealTimers()
})

describe("formatRelative", () => {
  it.each([
    ["under a minute stays 'just now'", 0, "just now"],
    ["half a minute is not yet a minute", 30_000, "just now"],
    ["59 seconds is not yet a minute", 59_000, "just now"],
    ["a full minute", MIN, "1m ago"],
    ["59 minutes", 59 * MIN, "59m ago"],
    ["an hour and a half is still one hour", 90 * MIN, "1h ago"],
    ["119 minutes is still one hour", 119 * MIN, "1h ago"],
    ["23 hours", 23 * HOUR, "23h ago"],
    ["23h36m is not yet a day", 23.6 * HOUR, "23h ago"],
    ["a full day", DAY, "yesterday"],
    ["36 hours is still one day", 1.5 * DAY, "yesterday"],
    ["two days", 2 * DAY, "2 days ago"],
    ["six days", 6 * DAY, "6 days ago"],
    ["6.5 days is still six days", 6.5 * DAY, "6 days ago"],
    ["6d23h is still six days", 6 * DAY + 23 * HOUR, "6 days ago"],
  ])("floors elapsed time — %s", (_name, elapsed, expected) => {
    vi.useFakeTimers()
    expect(ago(elapsed)).toBe(expected)
  })

  it("falls back to an absolute date from seven days on", () => {
    vi.useFakeTimers()
    expect(ago(7 * DAY)).toMatch(/2026/)
  })

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatRelative("not a date", "en-US")).toBe("")
  })

  it("treats a future timestamp as just now rather than a negative age", () => {
    vi.useFakeTimers()
    expect(ago(-5 * MIN)).toBe("just now")
  })
})
