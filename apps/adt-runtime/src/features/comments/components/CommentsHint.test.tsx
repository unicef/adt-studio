// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { createRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CommentsHint, hintSeen } from "./CommentsHint"

/**
 * The first-visit hint sits right above the reader's dock, where the read-aloud player opens.
 * Reaching for anything else has to move it out of the way, without ruling it seen for good.
 */

beforeEach(() => {
  vi.useFakeTimers()
  const container = document.createElement("div")
  container.id = "interface-container"
  document.body.appendChild(container)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.getElementById("interface-container")?.remove()
  localStorage.clear()
})

function renderHint(onDismiss: () => void) {
  const anchor = createRef<HTMLButtonElement>()
  render(
    <Provider store={createStore()}>
      <button ref={anchor} type="button">
        comment
      </button>
      <button type="button">read aloud</button>
      <CommentsHint apiBase="/p/token" anchor={anchor} side="bottom" onDismiss={onDismiss} />
    </Provider>,
  )
  act(() => {
    vi.advanceTimersByTime(1500)
  })
}

describe("CommentsHint", () => {
  it("steps aside when the reader reaches for another tool", () => {
    const onDismiss = vi.fn()
    renderHint(onDismiss)
    expect(screen.getByRole("status")).toBeTruthy()

    fireEvent.pointerDown(screen.getByRole("button", { name: "read aloud" }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(hintSeen("/p/token")).toBe(false)
  })

  it("stays put for clicks on itself or on the comment button", () => {
    const onDismiss = vi.fn()
    renderHint(onDismiss)

    fireEvent.pointerDown(screen.getByRole("status"))
    fireEvent.pointerDown(screen.getByRole("button", { name: "comment" }))

    expect(onDismiss).not.toHaveBeenCalled()
  })
})
