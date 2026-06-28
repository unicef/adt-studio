// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { initializeCustomActivity } from "./activity-custom"
import type { CustomActivityHandlers } from "./activity-custom"
import {
  confettiTriggerAtom,
  skipEnabledAtom,
  submitEnabledAtom,
  submitLabelAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "../state/activity.atoms"
import { pagesAtom, currentSectionIdAtom } from "../../navigation/state/nav.atoms"

const store = getDefaultStore()

/** Render a custom-activity section and return its element. */
function renderSection(sectionType = "activity_custom_jigsaw"): HTMLElement {
  document.body.innerHTML = `
    <section data-section-type="${sectionType}" data-id="pg008_s2">
      <div data-activity-status role="status" aria-live="polite"></div>
    </section>
  `
  return document.querySelector<HTMLElement>("section")!
}

/**
 * Simulate the <head> stub having buffered a registration during parse, then
 * boot the runtime initializer (which drains the buffer).
 */
function bootWithRegistration(
  section: HTMLElement,
  handlers: CustomActivityHandlers,
): () => void {
  window.__adtPendingCustomActivities = [{ section, handlers }]
  return initializeCustomActivity() ?? (() => {})
}

/** Invoke the Submit button's wired handler and flush async validation. */
async function clickSubmit(): Promise<void> {
  store.get(validateHandlerAtom)?.()
  await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  document.body.innerHTML = ""
  window.__adtPendingCustomActivities = undefined
  window.adtRegisterCustomActivity = undefined
  store.set(submitEnabledAtom, false)
  store.set(skipEnabledAtom, false)
  store.set(submitStateAtom, "submit")
  store.set(submitLabelAtom, null)
  store.set(validateHandlerAtom, () => null)
  store.set(confettiTriggerAtom, 0)
  store.set(pagesAtom, [
    { section_id: "pg008_s2", href: "pg008_s2.html" },
    { section_id: "pg009_s1", href: "pg009_s1.html" },
  ])
  store.set(currentSectionIdAtom, "pg008_s2")
})

describe("initializeCustomActivity", () => {
  it("returns null when there is no custom section and nothing buffered", () => {
    document.body.innerHTML = `<section data-section-type="text_only"></section>`
    expect(initializeCustomActivity()).toBeNull()
  })

  it("drains a buffered registration and enables Submit", () => {
    const section = renderSection()
    bootWithRegistration(section, { validate: () => false })

    expect(store.get(submitEnabledAtom)).toBe(true)
    expect(typeof store.get(validateHandlerAtom)).toBe("function")
  })

  it("runs the activity's validate() on Submit and stays on 'submit' when wrong", async () => {
    const section = renderSection()
    const validate = vi.fn().mockReturnValue(false)
    bootWithRegistration(section, { validate })

    await clickSubmit()

    expect(validate).toHaveBeenCalledTimes(1)
    expect(store.get(submitStateAtom)).toBe("submit")
    expect(store.get(submitEnabledAtom)).toBe(true)
    expect(store.get(confettiTriggerAtom)).toBe(0)
  })

  it("flips to 'next' and fires confetti when validate() passes", async () => {
    const section = renderSection()
    bootWithRegistration(section, { validate: () => true })

    await clickSubmit()

    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(confettiTriggerAtom)).toBe(1)
    // There IS a next page in the fixture, so the "Next" button stays enabled.
    expect(store.get(submitEnabledAtom)).toBe(true)
  })

  it("awaits a Promise-returning validate()", async () => {
    const section = renderSection()
    bootWithRegistration(section, { validate: () => Promise.resolve(true) })

    await clickSubmit()

    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("requires every registered grader to pass", async () => {
    const a = renderSection("activity_custom_a")
    initializeCustomActivity()
    // Register two activities via the live hook (post-boot path).
    window.adtRegisterCustomActivity!(a, { validate: () => true })
    window.adtRegisterCustomActivity!(a, { validate: () => false })

    await clickSubmit()

    expect(store.get(submitStateAtom)).toBe("submit")
  })

  it("treats a thrown validate() as a failure", async () => {
    const section = renderSection()
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    bootWithRegistration(section, {
      validate: () => {
        throw new Error("boom")
      },
    })

    await clickSubmit()

    expect(store.get(submitStateAtom)).toBe("submit")
    errSpy.mockRestore()
  })

  it("does not report success when nothing registered (stub missing)", async () => {
    renderSection() // section present, but no buffered/registered grader
    const cleanup = initializeCustomActivity()
    expect(cleanup).not.toBeNull()
    // Submit was never enabled because no grader registered.
    expect(store.get(submitEnabledAtom)).toBe(false)

    await clickSubmit()
    expect(store.get(submitStateAtom)).toBe("submit")
    expect(store.get(confettiTriggerAtom)).toBe(0)
  })

  it("cleanup clears the wired handlers", () => {
    const section = renderSection()
    const cleanup = bootWithRegistration(section, { validate: () => true })
    expect(store.get(submitEnabledAtom)).toBe(true)

    cleanup()

    expect(store.get(submitEnabledAtom)).toBe(false)
    expect(store.get(validateHandlerAtom)).toBeNull()
  })
})

describe("initializeCustomActivity — accessibility backstop", () => {
  it("backfills role + focusability on drop zones and non-native cards", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_custom_jigsaw">
        <h3>Assemble the puzzle</h3>
        <div data-activity-target="slot-1" aria-label="Top left"></div>
        <div data-activity-item="item-1">Tile A</div>
        <div data-activity-status aria-live="polite"></div>
      </section>`
    initializeCustomActivity()

    const zone = document.querySelector<HTMLElement>("[data-activity-target]")!
    expect(zone.getAttribute("role")).toBe("group")
    expect(zone.getAttribute("tabindex")).toBe("0")

    const card = document.querySelector<HTMLElement>("[data-activity-item]")!
    expect(card.getAttribute("role")).toBe("button")
    expect(card.getAttribute("tabindex")).toBe("0")
  })

  it("labels the section from its heading when unlabelled", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_custom_drag_drop">
        <h3>Sort the systems</h3>
        <div data-activity-item="item-1">X</div>
      </section>`
    initializeCustomActivity()

    const section = document.querySelector<HTMLElement>("section")!
    expect(section.getAttribute("role")).toBe("group")
    const labelledBy = section.getAttribute("aria-labelledby")
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toBe(
      "Sort the systems",
    )
  })

  it("never overrides author-provided ARIA", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_custom_jigsaw" role="region" aria-label="My puzzle">
        <div data-activity-target="slot-1" role="region" tabindex="-1" aria-label="Slot"></div>
        <button data-activity-item="item-1">Tile</button>
      </section>`
    initializeCustomActivity()

    const section = document.querySelector<HTMLElement>("section")!
    expect(section.getAttribute("role")).toBe("region")
    expect(section.getAttribute("aria-label")).toBe("My puzzle")

    const zone = document.querySelector<HTMLElement>("[data-activity-target]")!
    expect(zone.getAttribute("role")).toBe("region")
    expect(zone.getAttribute("tabindex")).toBe("-1")

    // Native <button> card is left untouched (no spurious role/tabindex).
    const card = document.querySelector<HTMLElement>("[data-activity-item]")!
    expect(card.hasAttribute("role")).toBe(false)
    expect(card.hasAttribute("tabindex")).toBe(false)
  })
})
