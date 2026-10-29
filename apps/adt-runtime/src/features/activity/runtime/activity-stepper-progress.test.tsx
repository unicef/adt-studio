// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { initializeStepperActivity } from "./activity-stepper"

vi.mock("./sounds", () => ({ playActivitySound: vi.fn() }))
let dispose: (() => void) | null = null
beforeEach(() => {
  localStorage.clear()
  getDefaultStore().set(translationsAtom, {})
  document.body.innerHTML = '<section data-activity-variant="stepper"><div data-stepper-root></div><script type="application/json" data-editable-activity></script></section>'
  document.querySelector("script")!.textContent = JSON.stringify({
    activity: {
      kind: "multiple-choice", enabled: true, sectionType: "activity_multiple_choice",
      steps: ["q1", "q2"].map((id) => ({ id, prompt: { text: "What shines in the daytime?" }, options: [
        { itemId: `${id}-sun`, text: { text: "Sun" }, correct: true },
        { itemId: `${id}-moon`, text: { text: "Moon" }, correct: false },
      ] })),
    },
    palette: { surface: "#fff", ink: "#111", accent: "#123456", accentSoft: "#eee", headerText: "#fff", body: "#fff", optionFill: "#fff", submit: "#123456", submitText: "#fff", optionText: "#111", selectedText: "#111" },
  })
})
afterEach(() => { act(() => dispose?.()); dispose = null; document.body.innerHTML = "" })

it("AC-2: exposes unchecked, retry and completed step states without relying on color", async () => {
  act(() => { dispose = initializeStepperActivity() })
  expect(await screen.findByRole("button", { name: "Step 1 of 2: Not checked" })).toBeTruthy()
  fireEvent.click(screen.getByRole("radio", { name: /Moon/ }))
  fireEvent.click(screen.getByRole("button", { name: "Check", exact: true }))
  expect(screen.getByRole("button", { name: "Step 1 of 2: Try again" }).textContent).toContain("↻")
  fireEvent.click(screen.getByRole("button", { name: "Try again", exact: true }))
  fireEvent.click(screen.getByRole("radio", { name: /Sun/ }))
  fireEvent.click(screen.getByRole("button", { name: "Check", exact: true }))
  expect(screen.getByRole("button", { name: "Step 1 of 2: Completed" }).textContent).toContain("✓")
  fireEvent.click(screen.getByRole("button", { name: "Step 2 of 2: Not checked" }))
  expect(screen.getByRole("button", { name: "Step 2 of 2: Not checked" }).getAttribute("aria-current")).toBe("step")
})
