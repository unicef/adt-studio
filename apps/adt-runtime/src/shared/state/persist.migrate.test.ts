// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { migratePersistedKey } from "@/shared/state/persist"

describe("migratePersistedKey", () => {
  beforeEach(() => localStorage.clear())

  it("carries a legacy value over to the new key", () => {
    localStorage.setItem("kidsTextScale", JSON.stringify("1.5"))
    migratePersistedKey("kidsTextScale", "textScale")
    expect(localStorage.getItem("textScale")).toBe(JSON.stringify("1.5"))
  })

  it("never overwrites a value already stored under the new key", () => {
    localStorage.setItem("kidsTextScale", JSON.stringify("2"))
    localStorage.setItem("textScale", JSON.stringify("1.25"))
    migratePersistedKey("kidsTextScale", "textScale")
    expect(localStorage.getItem("textScale")).toBe(JSON.stringify("1.25"))
  })

  it("does nothing when there is no legacy value", () => {
    migratePersistedKey("kidsTextScale", "textScale")
    expect(localStorage.getItem("textScale")).toBeNull()
  })
})
