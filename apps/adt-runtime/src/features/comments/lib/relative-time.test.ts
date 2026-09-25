import { describe, expect, it } from "vitest"
import { relativeTime } from "./relative-time"

const t = (key: string, vars: Record<string, string> = {}) => `${key}:${vars.count ?? ""}`
const NOW = Date.parse("2026-09-23T12:00:00Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const H = 3_600_000

describe("relativeTime", () => {
  it("says just now under a minute", () => {
    expect(relativeTime(ago(20_000), t, NOW, "en")).toBe("comments-just-now-label:")
  })

  /** The old forms were "29 h ago" and "1 d ago"; the browser has the real words. */
  it("uses whole words, and yesterday rather than 1 d", () => {
    expect(relativeTime(ago(5 * 60_000), t, NOW, "en")).toBe("5 minutes ago")
    expect(relativeTime(ago(3 * H), t, NOW, "en")).toBe("3 hours ago")
    expect(relativeTime(ago(30 * H), t, NOW, "en")).toBe("yesterday")
    expect(relativeTime(ago(3 * 24 * H), t, NOW, "en")).toBe("3 days ago")
  })

  it("speaks the book's language", () => {
    expect(relativeTime(ago(30 * H), t, NOW, "pt-BR")).toBe("ontem")
    expect(relativeTime(ago(3 * H), t, NOW, "es")).toBe("hace 3 horas")
  })

  it("falls back to a date after a week", () => {
    expect(relativeTime(ago(9 * 24 * H), t, NOW, "en")).toMatch(/\d/)
  })
})
