// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const state = vi.hoisted(() => ({ dirty: false }))
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }) }))
vi.mock("@/hooks/use-quizzes", () => ({ useQuizzes: () => ({ data: { quizzes: { quizzes: [{}] } } }) }))
vi.mock("../../components/floating-save", () => ({ useHasUnsavedChanges: () => state.dirty }))
vi.mock("./QuizzesLandingPage", () => ({ QuizzesLandingPage: () => null }))
vi.mock("./QuizzesView", () => ({ QuizzesView: () => <input aria-label="Quiz draft" defaultValue="Saved question" /> }))
vi.mock("./activities/ActivitiesWorkspace", () => ({ ActivitiesWorkspace: () => <p>Activity workspace</p> }))
const { QuizzesIndex } = await import("./QuizzesIndex")
afterEach(() => { cleanup(); state.dirty = false })

it("keeps the quiz editor mounted until pending edits are saved or discarded", () => {
  const view = render(<QuizzesIndex bookLabel="book" />)
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Quizzes" }), { button: 0, ctrlKey: false })
  const draft = screen.getByLabelText<HTMLInputElement>("Quiz draft")
  fireEvent.change(draft, { target: { value: "Unsaved question" } })
  state.dirty = true
  view.rerender(<QuizzesIndex bookLabel="book" />)
  const activities = screen.getByRole<HTMLButtonElement>("tab", { name: "Activities" })
  expect(activities.disabled).toBe(true)
  fireEvent.mouseDown(activities, { button: 0, ctrlKey: false })
  expect(screen.getByLabelText<HTMLInputElement>("Quiz draft").value).toBe("Unsaved question")
  expect(screen.getByRole("status").textContent).toBe("Save or discard your edits first")
  state.dirty = false
  view.rerender(<QuizzesIndex bookLabel="book" />)
  fireEvent.mouseDown(activities, { button: 0, ctrlKey: false })
  expect(screen.getByText("Activity workspace")).toBeTruthy()
})
