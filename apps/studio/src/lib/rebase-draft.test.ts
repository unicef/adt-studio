import { expect, it } from "vitest"
import { rebaseDraft } from "./rebase-draft"

it("reapplies only local fields by stable identity while retaining concurrent additions and ordering", () => {
  const base = [{ id: "a", text: "A", title: "old" }, { id: "b", text: "B", title: "old" }]
  const draft = [{ ...base[0], text: "Mine" }, base[1]]
  const latest = [{ id: "c", text: "New", title: "new" }, { ...base[1], text: "Other writer" }, { ...base[0], title: "Updated title" }]
  expect(rebaseDraft(base, draft, latest)).toEqual({ conflicts: [], value: [latest[0], latest[1], { ...latest[2], text: "Mine" }] })
})
it("requires a choice for overlapping edits and concurrent deletion, retaining the full draft", () => {
  const base = [{ id: "a", text: "A" }, { id: "b", text: "B" }]
  const draft = [{ id: "a", text: "Mine" }, { id: "b", text: "My B" }]
  const latest = [{ id: "a", text: "Theirs" }]
  expect(rebaseDraft(base, draft, latest)).toEqual({ value: draft, conflicts: ["/a/text", "/b"] })
  expect(rebaseDraft(base, draft, latest, "latest")).toEqual({ value: latest, conflicts: ["/a/text", "/b"] })
  expect(draft).toEqual([{ id: "a", text: "Mine" }, { id: "b", text: "My B" }])
})

it("keeps draft reordering while adopting an independent server content edit", () => {
  const base = [{ id: "a", text: "A" }, { id: "b", text: "B" }]
  expect(rebaseDraft(base, [base[1], base[0]], [{ ...base[0], text: "Latest A" }, base[1]])).toEqual({ conflicts: [], value: [base[1], { id: "a", text: "Latest A" }] })
})
