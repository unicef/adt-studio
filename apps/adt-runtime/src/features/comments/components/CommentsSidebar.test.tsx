// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it } from "vitest"
import type { PublishComment } from "@/features/comments/lib/contract"
import { commentModeAtom, commentsStatusAtom } from "@/features/comments/state/comments.atoms"
import { CommentsSidebar } from "./CommentsSidebar"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const COMMENT: PublishComment = {
  id: "comment-1",
  token: "tokenAbcdefghijklmnopqrstuvwxyz12",
  version: 1,
  page_section_id: "pg001_sec001",
  parent_id: null,
  session_id: "session-1",
  author_name: "Maria",
  author_color: "#0091ff",
  body: "the fox is lovely",
  anchor: null,
  resolved_at: null,
  edited_at: null,
  deleted_at: null,
  created_at: "2026-08-04T10:00:00.000Z",
}

function renderEmptySidebar(store = createStore(), comments: PublishComment[] = []) {
  render(
    <Provider store={store}>
      <CommentsSidebar
        open
        roots={comments}
        comments={comments}
        anchoredIds={new Set()}
        openThreadId={null}
        onSelect={() => {}}
        onClose={() => {}}
      />
    </Provider>,
  )
  return store
}

describe("an empty comment list", () => {
  it("offers to add the first comment, which turns comment mode on", async () => {
    const store = renderEmptySidebar()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add a comment" }))
    })

    expect(store.get(commentModeAtom)).toBe(true)
    expect(screen.queryByRole("button", { name: "Add a comment" })).toBeNull()
  })

  it("offers nothing on a link that no longer takes comments", () => {
    const store = createStore()
    store.set(commentsStatusAtom, "gone")
    renderEmptySidebar(store)

    expect(screen.queryByRole("button", { name: "Add a comment" })).toBeNull()
  })
})

describe("a comment list with comments", () => {
  it("keeps a way to add another one in the panel", async () => {
    const store = renderEmptySidebar(createStore(), [COMMENT])
    expect(screen.queryByText("No comments on this page yet")).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add a comment" }))
    })

    expect(store.get(commentModeAtom)).toBe(true)
    expect(screen.queryByRole("button", { name: "Add a comment" })).toBeNull()
  })
})
