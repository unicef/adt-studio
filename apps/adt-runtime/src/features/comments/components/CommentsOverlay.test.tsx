// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { CommentsApi } from "@/features/comments/lib/api"
import type { CommenterSession, PublishComment } from "@/features/comments/lib/contract"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import {
  commentDraftAtom,
  commentModeAtom,
  commentsSessionAtom,
  openThreadIdAtom,
} from "@/features/comments/state/comments.atoms"
import { CommentsOverlay } from "./CommentsOverlay"

/** The popover positions itself against the page with floating-ui, which needs layout jsdom
 *  does not have; its contents are what these tests are about. */
vi.mock("@/features/comments/components/PointPopover", () => ({
  PointPopover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
import { CommentModePill } from "./CommentModePill"

/** Comment mode as a review tool's comment tool: on until the reader leaves it, with Esc
 *  stepping back one layer at a time. */

beforeAll(() => {
  /** Pins are measured against the page; jsdom has no layout to observe. */
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const SESSION: CommenterSession = { id: "session-1", name: "Maria", color: "#0091ff", is_author: false }

const POSTED: PublishComment = {
  id: "comment-1",
  token: "tokenAbcdefghijklmnopqrstuvwxyz12",
  version: 1,
  page_section_id: "pg001_sec001",
  parent_id: null,
  session_id: SESSION.id,
  author_name: SESSION.name,
  author_color: SESSION.color,
  body: "the fox is lovely",
  anchor: null,
  resolved_at: null,
  edited_at: null,
  deleted_at: null,
  created_at: "2026-08-04T10:00:00.000Z",
}

function renderOverlay() {
  const api = {
    list: vi.fn(),
    createSession: vi.fn(async () => SESSION),
    claimSession: vi.fn(),
    createComment: vi.fn(async () => POSTED),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  } as unknown as CommentsApi
  const store = createStore()
  store.set(commentsSessionAtom, SESSION)
  store.set(currentSectionIdAtom, "pg001_sec001")
  store.set(commentModeAtom, true)
  render(
    <Provider store={store}>
      <CommentsOverlay context={{ apiBase: "/p/token/", api }} refresh={async () => {}} />
      <CommentModePill />
    </Provider>,
  )
  const escape = async () => {
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" })
    })
  }
  return { api, store, escape }
}

describe("comment mode", () => {
  it("stays on after a comment is posted", async () => {
    const { api, store } = renderOverlay()
    await act(async () => {
      store.set(commentDraftAtom, { anchor: null, x: 40, y: 40 })
    })

    const body = await screen.findByPlaceholderText("Write a comment")
    fireEvent.change(body, { target: { value: "the fox is lovely" } })
    await act(async () => {
      fireEvent.keyDown(body, { key: "Enter" })
    })

    expect(api.createComment).toHaveBeenCalledTimes(1)
    expect(store.get(commentDraftAtom)).toBeNull()
    expect(store.get(commentModeAtom)).toBe(true)
  })

  it("closes an open comment box on the first Esc and leaves comment mode on the next", async () => {
    const { store, escape } = renderOverlay()
    await act(async () => {
      store.set(commentDraftAtom, { anchor: null, x: 40, y: 40 })
    })

    await escape()
    expect(store.get(commentDraftAtom)).toBeNull()
    expect(store.get(commentModeAtom)).toBe(true)

    await escape()
    expect(store.get(commentModeAtom)).toBe(false)
  })

  it("closes an open thread before leaving comment mode", async () => {
    const { store, escape } = renderOverlay()
    await act(async () => {
      store.set(openThreadIdAtom, "comment-1")
    })

    await escape()
    expect(store.get(openThreadIdAtom)).toBeNull()
    expect(store.get(commentModeAtom)).toBe(true)

    await escape()
    expect(store.get(commentModeAtom)).toBe(false)
  })

  it("says it is on at the top of the page, with a way out", async () => {
    const { store } = renderOverlay()

    expect(screen.getByText("Commenting").closest("[role=status]")).not.toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done commenting" }))
    })

    expect(store.get(commentModeAtom)).toBe(false)
  })
})
