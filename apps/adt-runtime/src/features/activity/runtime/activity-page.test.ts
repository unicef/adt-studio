// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { initializeActivityPage } from "./activity-page"
import { activityStore } from "./activity-scope"
import { submitEnabledAtom, submitLabelAtom, submitStateAtom, validateHandlerAtom } from "../state/activity.atoms"
import { currentSectionIdAtom, pagesAtom } from "../../navigation/state/nav.atoms"
import { translationsAtom } from "../../language/state/language.atoms"
import { navigateToPage } from "../../navigation/lib/page-swap"

const { isValidText } = vi.hoisted(() => ({ isValidText: vi.fn(async () => true) }))
vi.mock("../lib/text-validator", () => ({ getSharedTextValidator: () => ({ isValidText }) }))
vi.mock("./sounds", () => ({ playActivitySound: vi.fn() }))
vi.mock("../lib/progress-toast", () => ({ showActivityProgressToast: vi.fn() }))
vi.mock("../../navigation/lib/page-swap", () => ({ navigateToPage: vi.fn() }))

const shared = getDefaultStore()
let dispose: (() => void) | null
function blank(id: string, answer: string) {
  return `<div data-activity-block="${id}" data-block-answers='{"item-1":"${answer}"}'>
    <section data-section-type="activity_fill_in_the_blank"><label>${id}<input type="text" data-aria-id="answer" data-activity-item="item-1"></label></section></div>`
}
function setup(content: string, mode = "page") {
  document.body.innerHTML = `<div data-experimental-activity-page="${mode}">${content}</div>`
  dispose = initializeActivityPage()
}
function input(index: number, value: string) {
  const el = document.querySelectorAll<HTMLInputElement>("input, textarea")[index]
  el.value = value
  el.dispatchEvent(new Event("input", { bubbles: true }))
  return el
}
async function submit() { await shared.get(validateHandlerAtom)?.() }
beforeEach(() => {
  vi.clearAllMocks()
  isValidText.mockResolvedValue(true)
  localStorage.clear()
  shared.set(translationsAtom, {})
  shared.set(currentSectionIdAtom, "a")
  shared.set(pagesAtom, [{ section_id: "a", href: "a.html" }, { section_id: "b", href: "b.html" }])
  window.correctAnswers = { "item-1": "WRONG GLOBAL ANSWER" }
})
afterEach(() => { dispose?.(); dispose = null; document.body.innerHTML = "" })

describe("experimental activity pages", () => {
  it("checks two FITB instances with identical local IDs independently, then navigates once", async () => {
    setup(blank("a", "sun") + blank("b", "moon"))
    input(0, "sun"); input(1, "sun")
    await submit()
    expect(shared.get(submitStateAtom)).toBe("submit")
    expect(document.activeElement).toBe(document.querySelectorAll("input")[1])
    expect(document.querySelector('[role="status"]')?.textContent).toBe("1 of 2 sections complete")
    input(1, "moon")
    await submit()
    expect(shared.get(submitStateAtom)).toBe("next")
    expect(navigateToPage).not.toHaveBeenCalled()
    await submit()
    expect(navigateToPage).toHaveBeenCalledExactlyOnceWith("b.html")
  })

  it("checks only the active section and focuses the next before page navigation", async () => {
    setup(blank("a", "sun") + blank("b", "moon"), "section")
    input(0, "sun"); input(1, "moon")
    await submit()
    const second = document.querySelectorAll<HTMLElement>("[data-activity-block]")[1]
    expect(activityStore(second).get(submitStateAtom)).toBe("submit")
    expect(shared.get(submitLabelAtom)).toBe("Next section")
    await submit()
    expect(navigateToPage).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(second.querySelector("input"))
    await submit()
    expect(shared.get(submitStateAtom)).toBe("next")
  })

  it("waits for written-response acceptance while a choice and a blank validate", async () => {
    let resolve!: (value: boolean) => void
    isValidText.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done }))
    setup(blank("a", "sun") + `<div data-activity-block="b" data-block-answers='{"item-1":true}'>
      <section data-section-type="activity_multiple_choice"><label class="activity-option"><input name="b-choice" type="radio" data-activity-item="item-1">Yes</label></section></div>
      <div data-activity-block="c"><section data-section-type="activity_open_ended_answer"><textarea data-aria-id="response"></textarea></section></div>`)
    input(0, "sun")
    document.querySelector<HTMLElement>(".activity-option")!.click()
    input(2, "The sun gives us light")
    const checking = submit()
    await vi.waitFor(() => expect(isValidText).toHaveBeenCalled())
    expect(shared.get(submitEnabledAtom)).toBe(false)
    expect(shared.get(submitLabelAtom)).toBe("Checking…")
    resolve(true); await checking
    expect(shared.get(submitStateAtom)).toBe("next")
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Page complete")
  })

  it("invalidates completion after editing and retains each section's text across reload", async () => {
    setup(blank("a", "sun") + blank("b", "moon"))
    input(0, "sun"); input(1, "moon"); await submit()
    input(1, "wrong")
    expect(shared.get(submitStateAtom)).toBe("submit")
    dispose?.()
    setup(blank("a", "sun") + blank("b", "moon"))
    expect(Array.from(document.querySelectorAll("input")).map(el => el.value)).toEqual(["sun", "wrong"])
  })

  it("discards async results after a language change and after disposal", async () => {
    let resolve!: (value: boolean) => void
    isValidText.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done }))
    setup(`<div data-activity-block="a"><section data-section-type="activity_open_ended_answer"><textarea data-aria-id="response"></textarea></section></div>`)
    input(0, "A useful response")
    const checking = submit()
    await vi.waitFor(() => expect(isValidText).toHaveBeenCalled())
    shared.set(translationsAtom, { next: "Suivant" })
    resolve(true); await checking
    expect(shared.get(submitStateAtom)).toBe("submit")
    isValidText.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done }))
    const second = submit()
    dispose?.(); dispose = null
    shared.set(submitLabelAtom, "Another page")
    resolve(true); await second
    expect(shared.get(submitLabelAtom)).toBe("Another page")
  })

  it("shows a terminal completion state when there is no next page", async () => {
    shared.set(pagesAtom, [{ section_id: "a", href: "a.html" }])
    setup(blank("a", "sun"))
    input(0, "sun"); await submit()
    expect(shared.get(submitLabelAtom)).toBe("Page complete")
    expect(shared.get(submitEnabledAtom)).toBe(false)
    expect(navigateToPage).not.toHaveBeenCalled()
  })

  it("keeps repeated choice instances independent and restores choices through their controllers", async () => {
    const choice = (id: string, correct: number) => `<div data-activity-block="${id}" data-block-answers='{"item-${correct}":true}'>
      <section data-section-type="activity_multiple_choice">${[1, 2].map(n => `<label class="activity-option"><input name="${id}--question" type="radio" value="${n}" data-activity-item="item-${n}">Option ${n}</label>`).join("")}</section></div>`
    const html = choice("a", 1) + choice("b", 2)
    setup(html)
    document.querySelectorAll<HTMLElement>(".activity-option")[0].click()
    document.querySelectorAll<HTMLElement>(".activity-option")[3].click()
    await submit()
    expect(shared.get(submitStateAtom)).toBe("next")
    dispose?.(); setup(html)
    expect(document.querySelectorAll("input:checked")).toHaveLength(2)
    await submit()
    expect(shared.get(submitStateAtom)).toBe("next")
  })

  it("gives hydrated inline blanks unique DOM IDs across instances", () => {
    const inline = (id: string) => `<div data-activity-block="${id}" data-block-answers='{"item-1":"sun"}'>
      <section data-section-type="activity_fill_in_the_blank"><p class="fitb-sentence"><span data-id="${id}-text">The [[blank:item-1]].</span></p></section></div>`
    setup(inline("a") + inline("b"))
    expect(Array.from(document.querySelectorAll("input")).map(el => el.id)).toEqual(["a--fitb-input-1", "b--fitb-input-1"])
  })
})
