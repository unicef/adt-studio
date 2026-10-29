// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { initializeQuizActivity } from "../runtime/activity-quiz"
import { confettiTriggerAtom, submitStateAtom, submitVisibleAtom, validateHandlerAtom } from "../state/activity.atoms"
import { translationsAtom } from "@/features/language/state/language.atoms"

const store = getDefaultStore()
let dispose: (() => void) | null = null
beforeEach(() => {
  store.set(translationsAtom, {})
  store.set(confettiTriggerAtom, 0)
  document.body.innerHTML = `<section data-section-type="activity_quiz" data-correct-answers='{"answer":true,"wrong":false}'>
    <header><p data-id="question">What shines in the daytime?</p></header>
    <div role="group">
      <label class="activity-option" data-activity-item="answer" data-explanation="A star lights our day." data-explanation-id="explanation"><input type="radio" name="quiz" /><span data-id="answer">The sun</span></label>
      <label class="activity-option" data-activity-item="wrong"><input type="radio" name="quiz" /><span data-id="wrong">The moon</span></label>
    </div>
  </section>`
})
afterEach(() => { act(() => dispose?.()); dispose = null; cleanup(); document.body.innerHTML = "" })

it("reveals the saved answer without grading, and restores quiz interaction", async () => {
  act(() => { dispose = initializeQuizActivity() })
  fireEvent.click(await screen.findByRole("button", { name: "Study card" }))
  expect(document.querySelector<HTMLElement>('[role="group"] > [role="group"]')?.style.display).toBe("none")
  expect(store.get(submitVisibleAtom)).toBe(false)
  const reveal = screen.getByRole("button", { name: "Show answer" })
  expect(reveal.getAttribute("aria-expanded")).toBe("false")
  fireEvent.click(reveal)
  expect(reveal.getAttribute("aria-expanded")).toBe("true")
  expect(document.getElementById(reveal.getAttribute("aria-controls")!)?.textContent).toContain("The sun")
  fireEvent.keyDown(document, { key: "1" })
  act(() => store.get(validateHandlerAtom)?.())
  expect(store.get(confettiTriggerAtom)).toBe(0)
  expect(store.get(submitStateAtom)).toBe("submit")
  expect(document.querySelector('input:checked')).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Back to quiz" }))
  fireEvent.click(document.querySelector<HTMLElement>('.activity-option[data-activity-item="answer"]')!)
  await waitFor(() => expect(store.get(confettiTriggerAtom)).toBe(1))
})

it("updates revealed answers and controls when the reader language changes", async () => {
  act(() => { dispose = initializeQuizActivity() })
  fireEvent.click(await screen.findByRole("button", { name: "Study card" }))
  fireEvent.click(screen.getByRole("button", { name: "Show answer" }))
  act(() => store.set(translationsAtom, { answer: "Le soleil", explanation: "Une étoile éclaire le jour.", "study-hide-answer": "Masquer la réponse" }))
  expect(await screen.findByRole("button", { name: "Masquer la réponse" })).toBeTruthy()
  expect(screen.getByText("Le soleil")).toBeTruthy()
  expect(screen.getByText("Une étoile éclaire le jour.")).toBeTruthy()
  act(() => dispose?.())
  dispose = null
  expect(document.querySelector("[data-quiz-study]")).toBeNull()
})
