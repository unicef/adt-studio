// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { initializeOpenEndedActivity } from "./activity-open-ended"
import {
  skipEnabledAtom,
  submitEnabledAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "../state/activity.atoms"
import { pagesAtom, currentSectionIdAtom } from "../../navigation/state/nav.atoms"

import { TextValidator } from "../lib/text-validator"

const store = getDefaultStore()

function setupSection(): {
  shortInput: HTMLInputElement
  longInput: HTMLTextAreaElement
} {
  document.body.innerHTML = `
    <section data-section-type="activity_open_ended_answer" data-section-id="pg001_sec001">
      <div class="mb-4">
        <label data-id="text-1">Name:</label>
        <input type="text" data-aria-id="aria-1-0-0" aria-label="Student name" />
      </div>
      <div class="mb-6">
        <p><span data-id="text-2">Describe what happened.</span></p>
        <textarea data-aria-id="aria-1-0-1" aria-label="Describe what happened"></textarea>
      </div>
    </section>
  `
  return {
    shortInput: document.querySelector<HTMLInputElement>(
      "input[data-aria-id='aria-1-0-0']",
    )!,
    longInput: document.querySelector<HTMLTextAreaElement>(
      "textarea[data-aria-id='aria-1-0-1']",
    )!,
  }
}

async function flushMicrotasks(): Promise<void> {
  // The submit handler kicks off an async validation chain. Yield enough
  // times for every awaited microtask in `validateAll` to settle — one per
  // input, plus the outer wrapper.
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

beforeEach(() => {
  document.body.innerHTML = ""
  localStorage.clear()
  store.set(submitEnabledAtom, false)
  store.set(skipEnabledAtom, false)
  store.set(submitStateAtom, "submit")
  store.set(validateHandlerAtom, () => null)
  store.set(pagesAtom, [
    { section_id: "pg001_sec001", href: "pg001_sec001.html" },
    { section_id: "next", href: "next.html" },
  ])
  store.set(currentSectionIdAtom, "pg001_sec001")
})

describe("initializeOpenEndedActivity", () => {
  it("returns null when there is no open-ended section on the page", () => {
    document.body.innerHTML = "<main>plain page</main>"
    expect(initializeOpenEndedActivity()).toBeNull()
  })

  it("enables submit only after the user types something", () => {
    setupSection()
    initializeOpenEndedActivity()

    const input = document.querySelector<HTMLInputElement>("input")!
    expect(store.get(submitEnabledAtom)).toBe(false)

    input.value = "Maria"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(store.get(submitEnabledAtom)).toBe(true)
  })

  it("accepts clean text in all inputs and flips to next state", async () => {
    const { shortInput, longInput } = setupSection()
    initializeOpenEndedActivity()

    shortInput.value = "Maria"
    shortInput.dispatchEvent(new Event("input", { bubbles: true }))
    longInput.value = "The story is about a young girl learning to read."
    longInput.dispatchEvent(new Event("input", { bubbles: true }))

    const validate = store.get(validateHandlerAtom)
    validate?.()
    await flushMicrotasks()

    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(submitEnabledAtom)).toBe(true)
  })

  it("flags profanity with the orange/red border feedback", async () => {
    const { shortInput } = setupSection()
    initializeOpenEndedActivity()

    shortInput.value = "shit"
    shortInput.dispatchEvent(new Event("input", { bubbles: true }))
    // Fill the textarea cleanly so the failure is unambiguously the profanity.
    const longInput = document.querySelector<HTMLTextAreaElement>("textarea")!
    longInput.value = "This is a perfectly normal answer."
    longInput.dispatchEvent(new Event("input", { bubbles: true }))

    const validate = store.get(validateHandlerAtom)
    validate?.()
    await flushMicrotasks()

    expect(store.get(submitStateAtom)).toBe("submit")
    expect(shortInput.classList.contains("border-red-500")).toBe(true)
    expect(shortInput.getAttribute("data-has-profanity-feedback")).toBe("true")
  })

  it("flags gibberish (keyboard mashing) with orange feedback", async () => {
    const { shortInput, longInput } = setupSection()
    initializeOpenEndedActivity()

    shortInput.value = "Maria"
    shortInput.dispatchEvent(new Event("input", { bubbles: true }))
    longInput.value = "asdfasdfasdfasdf qwerty"
    longInput.dispatchEvent(new Event("input", { bubbles: true }))

    const validate = store.get(validateHandlerAtom)
    validate?.()
    await flushMicrotasks()

    expect(store.get(submitStateAtom)).toBe("submit")
    expect(longInput.classList.contains("border-orange-500")).toBe(true)
    expect(longInput.getAttribute("data-has-gibberish-feedback")).toBe("true")
  })

  it("treats unfilled inputs as empty without flagging them", async () => {
    const { shortInput } = setupSection()
    initializeOpenEndedActivity()

    shortInput.value = "Maria"
    shortInput.dispatchEvent(new Event("input", { bubbles: true }))

    const validate = store.get(validateHandlerAtom)
    validate?.()
    await flushMicrotasks()

    const longInput = document.querySelector<HTMLTextAreaElement>("textarea")!
    expect(store.get(submitStateAtom)).toBe("submit")
    // Empty inputs get no feedback class — just stay neutral.
    expect(longInput.classList.contains("border-orange-500")).toBe(false)
    expect(longInput.classList.contains("border-red-500")).toBe(false)
  })

  it("keeps the next-activity button enabled after a clean submit even if the user edits", async () => {
    const { shortInput, longInput } = setupSection()
    initializeOpenEndedActivity()

    shortInput.value = "Maria"
    shortInput.dispatchEvent(new Event("input", { bubbles: true }))
    longInput.value = "This is a perfectly normal answer."
    longInput.dispatchEvent(new Event("input", { bubbles: true }))
    store.get(validateHandlerAtom)?.()
    await flushMicrotasks()
    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(submitEnabledAtom)).toBe(true)

    shortInput.value = ""
    shortInput.dispatchEvent(new Event("input", { bubbles: true }))
    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(submitEnabledAtom)).toBe(true)
  })

  it("persists input values across reinitialization via localStorage", () => {
    setupSection()
    initializeOpenEndedActivity()

    const input = document.querySelector<HTMLInputElement>("input")!
    input.value = "Maria"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    // Simulate a page reload: rebuild the DOM and re-initialize.
    setupSection()
    initializeOpenEndedActivity()

    const restored = document.querySelector<HTMLInputElement>("input")!
    expect(restored.value).toBe("Maria")
  })
})

it.each(["navigation", "edit"])("ignores an asynchronous open-ended result after %s", async (action) => {
  const { shortInput, longInput } = setupSection()
  shortInput.value = "Maria"
  longInput.value = "I enjoyed the story."
  const cleanup = initializeOpenEndedActivity()
  let finish!: (value: boolean) => void
  const validation = vi.spyOn(TextValidator.prototype, "isValidText").mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve }))
  store.get(validateHandlerAtom)?.()
  if (action === "navigation") {
    cleanup?.()
    document.body.innerHTML = "<main>New page</main>"
    store.set(submitStateAtom, "submit")
  } else {
    shortInput.value = ""
    shortInput.dispatchEvent(new Event("input", { bubbles: true }))
  }
  // Release the first input and allow any subsequent validation to finish.
  validation.mockResolvedValue(true)
  finish(true)
  await flushMicrotasks()
  expect(store.get(submitStateAtom)).toBe("submit")
  cleanup?.()
  validation.mockRestore()
})

it.each([null, "", "unknown", "text"])("accepts a legacy open-ended control with type %s and excludes non-text controls", async (type) => {
  const { shortInput, longInput } = setupSection()
  if (type === null) shortInput.removeAttribute("type")
  else shortInput.setAttribute("type", type)
  longInput.remove()
  shortInput.insertAdjacentHTML("afterend", '<input type="hidden"><input type="checkbox"><input type="number">')
  const cleanup = initializeOpenEndedActivity()
  try {
    shortInput.value = "Maria"
    shortInput.dispatchEvent(new Event("input", { bubbles: true }))
    expect(store.get(submitEnabledAtom)).toBe(true)
    store.get(validateHandlerAtom)?.()
    await flushMicrotasks()
    expect(store.get(submitStateAtom)).toBe("next")
    expect(shortInput.getAttribute("type")).toBe(type)
  } finally {
    cleanup?.()
  }
})
