// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it } from "vitest"
import { commentModeAtom, commentsStatusAtom } from "@/features/comments/state/comments.atoms"
import { CommentsSidebar } from "./CommentsSidebar"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function renderEmptySidebar(store = createStore()) {
  render(
    <Provider store={store}>
      <CommentsSidebar
        open
        roots={[]}
        comments={[]}
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
