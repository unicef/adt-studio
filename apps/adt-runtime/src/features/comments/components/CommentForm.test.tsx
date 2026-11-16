// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CommentsApi } from "@/features/comments/lib/api"
import type { CommenterSession, PublishComment } from "@/features/comments/lib/contract"
import { commentsSessionAtom } from "@/features/comments/state/comments.atoms"
import { CommentForm } from "./CommentForm"

/**
 * The composer's identity step, read from the reader's side of the M3.5 door. Whoever
 * established the identity — the access-code gate, which collects the name up front, or
 * `POST /session` on a codeless publication — a session already in hand must never make the
 * reader introduce themselves a second time.
 */

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const SESSION: CommenterSession = {
  id: "session-1",
  name: "Maria",
  color: "#0091ff",
  is_author: false,
}

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

function renderForm(session: CommenterSession | null) {
  const api = {
    list: vi.fn(),
    createSession: vi.fn(async () => SESSION),
    claimSession: vi.fn(),
    createComment: vi.fn(async () => POSTED),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  } as unknown as CommentsApi

  const store = createStore()
  store.set(commentsSessionAtom, session)

  const { container } = render(
    <Provider store={store}>
      <CommentForm
        context={{ apiBase: "/p/token/", api }}
        pageSectionId="pg001_sec001"
        onPosted={() => {}}
      />
    </Provider>,
  )

  const submit = async (): Promise<void> => {
    const form = container.querySelector("form")
    expect(form).not.toBeNull()
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement)
    })
  }

  const type = (element: HTMLElement, value: string): void => {
    fireEvent.change(element, { target: { value } })
  }

  return { api, store, submit, type }
}

const nameField = (): HTMLElement | null => screen.queryByPlaceholderText("e.g. Maria")

describe("CommentForm identity step", () => {
  it("never asks for a name when the reader already has a session", async () => {
    const { api, submit, type } = renderForm(SESSION)

    expect(screen.queryByText("Your name")).toBeNull()
    expect(nameField()).toBeNull()

    type(screen.getByPlaceholderText("Write a comment"), "the fox is lovely")
    await submit()

    expect(api.createSession).not.toHaveBeenCalled()
    expect(api.createComment).toHaveBeenCalledTimes(1)
  })

  it("asks for a name when there is no session, then posts with it", async () => {
    const { api, submit, type } = renderForm(null)

    expect(screen.getByText("Your name")).not.toBeNull()

    type(screen.getByPlaceholderText("Write a comment"), "the fox is lovely")
    type(nameField() as HTMLElement, "  Maria  ")
    await submit()

    expect(api.createSession).toHaveBeenCalledWith("Maria")
    expect(api.createComment).toHaveBeenCalledTimes(1)
  })

  it("drops the name step the moment a session lands from elsewhere", async () => {
    const { store } = renderForm(null)
    expect(nameField()).not.toBeNull()

    /** What the gate's session cookie looks like to the reader: the first comment list comes
     *  back with a session already attached, and the composer must fold the step away. */
    await act(async () => {
      store.set(commentsSessionAtom, SESSION)
    })

    expect(nameField()).toBeNull()
  })
})

describe("CommentForm keyboard", () => {
  const body = (): HTMLElement => screen.getByPlaceholderText("Write a comment")

  it("posts on Enter and keeps Shift+Enter for a new line", async () => {
    const { api, type } = renderForm(SESSION)
    type(body(), "the fox is lovely")

    await act(async () => {
      fireEvent.keyDown(body(), { key: "Enter", shiftKey: true })
    })
    expect(api.createComment).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.keyDown(body(), { key: "Enter" })
    })
    expect(api.createComment).toHaveBeenCalledTimes(1)
  })

  /** Japanese, Chinese and Korean are typed through an input method, whose Enter picks the
   *  word; posting then would send half a sentence. Safari reports it as key code 229. */
  it("does not post on the Enter that confirms an input-method composition", async () => {
    const { api, type } = renderForm(SESSION)
    type(body(), "きつね")

    await act(async () => {
      fireEvent.keyDown(body(), { key: "Enter", isComposing: true })
      fireEvent.keyDown(body(), { key: "Enter", keyCode: 229 })
    })

    expect(api.createComment).not.toHaveBeenCalled()
  })

  it("posts a comment once however fast Enter is pressed again", async () => {
    const { api, type } = renderForm(SESSION)
    let finish: (comment: PublishComment) => void = () => {}
    vi.mocked(api.createComment).mockImplementationOnce(
      () => new Promise<PublishComment>((resolve) => {
        finish = resolve
      }),
    )
    type(body(), "the fox is lovely")

    await act(async () => {
      fireEvent.keyDown(body(), { key: "Enter" })
      fireEvent.keyDown(body(), { key: "Enter" })
    })
    await act(async () => {
      finish(POSTED)
    })

    expect(api.createComment).toHaveBeenCalledTimes(1)
  })
})
