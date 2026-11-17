// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ ids: ["pg001_sec002", "pg001_sec001"] }))
vi.mock("@/hooks/use-book-publication", () => ({ useBookPublication: () => ({ data: { record: {} } }) }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: [{ pageId: "pg001", pageNumber: 1, sections: state.ids.map((sectionId, sectionIndex) => ({ sectionId, sectionIndex })) }] }) }))
vi.mock("@/hooks/use-publication-feedback", () => ({ usePublicationComments: () => ({ data: { comments: [{ id: "c1", parent_id: null, page_section_id: "pg001_sec001", version: 1, created_at: "2026-10-31T12:00:00Z", resolved_at: null, deleted_at: null, author_name: "Reader", body: "About A" }] } }) }))
import { useBookComments } from "./use-book-comments"
function Probe() {
  const comments = useBookComments("book")
  return <ul>{comments.ordered.map(section => <li key={section.sectionId}>{section.sectionId}:{section.sectionIndex}:{section.waiting}:{section.latestThreadId}</li>)}</ul>
}
afterEach(cleanup)
beforeEach(() => { state.ids = ["pg001_sec002", "pg001_sec001"] })
it("keeps counts and next-comment navigation on the real owner across reorder, retirement and restore", () => {
  const view = render(<Probe />)
  expect(screen.getByRole("listitem").textContent).toBe("pg001_sec001:1:1:c1")
  state.ids = ["pg001_sec003", "pg001_sec002", "pg001_sec001"]; view.rerender(<Probe />)
  expect(screen.getByRole("listitem").textContent).toBe("pg001_sec001:2:1:c1")
  state.ids = ["pg001_sec003"]; view.rerender(<Probe />)
  expect(screen.queryByRole("listitem")).toBeNull()
  state.ids = ["pg001_sec001"]; view.rerender(<Probe />)
  expect(screen.getByRole("listitem").textContent).toBe("pg001_sec001:0:1:c1")
})
it("never attaches feedback to an ambiguous or absent current identity", () => {
  state.ids = ["", "pg001_sec001", "pg001_sec001"]
  render(<Probe />)
  expect(screen.queryByRole("listitem")).toBeNull()
})
