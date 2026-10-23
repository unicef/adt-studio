// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { initializePageContent, subscribeLanguageChanges, disposeActivityInitializers } from "./lifecycle"
import { currentLanguageAtom, translationsAtom } from "@/features/language/state/language.atoms"
import { easyReadModeAtom } from "@/shared/state/ui.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { currentSectionIdAtom, pagesAtom } from "@/features/navigation/state/nav.atoms"
import { submitStateAtom, validateHandlerAtom } from "@/features/activity/state/activity.atoms"

const store = getDefaultStore()
let unsubscribe: (() => void) | undefined
beforeEach(() => {
  localStorage.clear()
  store.set(currentLanguageAtom, "en")
  store.set(easyReadModeAtom, false)
  store.set(translationsAtom, { question: "The [[blank:item-1]] shines." })
  store.set(appConfigAtom, { bundleVersion: "1", languages: ["en", "fr"] } as never)
  store.set(pagesAtom, [
    { section_id: "pg001_sec001", href: "pg001_sec001.html" },
    { section_id: "next", href: "next.html" },
  ])
  store.set(currentSectionIdAtom, "pg001_sec001")
  document.head.innerHTML = '<meta name="title-id" content="pg001_sec001">'
  document.body.innerHTML = `<main><div id="content"><section data-section-type="activity_fill_in_the_blank">
    <p class="fitb-sentence"><span data-id="question">The [[blank:item-1]] shines.</span></p>
  </section></div></main>`
  window.correctAnswers = { "item-1": "sun" }
  window.activityAnswerTextIds = { "item-1": "pg001_sec001_ans_item-1" }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url.includes("/fr/texts.json") ? {
      question: "Le [[blank:item-1]] brille.",
      question_easy_read: "Voici le [[blank:item-1]].",
      "pg001_sec001_ans_item-1": " soleil ",
    } : {},
  })))
})
afterEach(() => {
  unsubscribe?.()
  unsubscribe = undefined
  disposeActivityInitializers()
  store.set(easyReadModeAtom, false)
  window.correctAnswers = undefined
  window.activityAnswerTextIds = undefined
  vi.unstubAllGlobals()
})

it("preserves inline fields and drafts through the actual language and Easy Read lifecycle", async () => {
  initializePageContent()
  unsubscribe = subscribeLanguageChanges()
  const original = document.querySelector("input")!
  original.value = "soleil"
  original.dispatchEvent(new Event("input", { bubbles: true }))
  store.set(currentLanguageAtom, "fr")
  await vi.waitFor(() => expect(document.querySelector('[data-id="question"]')?.textContent).toContain("Le "))
  const translated = document.querySelector("input")
  expect(translated).not.toBeNull()
  expect(translated?.value).toBe("soleil")
  expect(translated).not.toBe(original)
  store.get(validateHandlerAtom)?.()
  expect(store.get(submitStateAtom)).toBe("next")
  for (const enabled of [true, false, true]) {
    store.set(easyReadModeAtom, enabled)
    expect(document.querySelector("input")?.value).toBe("soleil")
    expect(document.querySelector('[data-id="question"]')?.textContent).toContain(enabled ? "Voici" : "Le")
    expect(document.querySelectorAll("input")).toHaveLength(1)
  }
  expect(window.correctAnswers).toEqual({ "item-1": "sun" })
  expect(store.get(translationsAtom)["pg001_sec001_ans_item-1"]).toBe(" soleil ")

  // An unmounted activity must not hydrate or attach listeners to its old DOM.
  disposeActivityInitializers()
  store.set(easyReadModeAtom, false)
  expect(document.querySelector("input")).toBeNull()
})
