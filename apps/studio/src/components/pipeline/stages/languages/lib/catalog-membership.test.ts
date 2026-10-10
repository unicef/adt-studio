import { expect, it } from "vitest"
import { entryBelongsToPage } from "./catalog-entries"

it("shows moved, shared and newly allocated IDs on their current pages", () => {
  const moved = { id: "pg001_t001", text: "Moved", locations: [{ pageId: "pg002" }] }
  expect(entryBelongsToPage(moved, "pg002")).toBe(true)
  expect(entryBelongsToPage(moved, "pg001")).toBe(false)
  expect(entryBelongsToPage({ id: "new-stable-text", text: "New", locations: [{ pageId: "pg002" }] }, "pg002")).toBe(true)
  expect(entryBelongsToPage({ ...moved, locations: [{ pageId: "pg001" }, { pageId: "pg002" }] }, "pg001")).toBe(true)
  expect(entryBelongsToPage({ id: "pg003_t001", text: "Legacy" }, "pg003")).toBe(true)
})
