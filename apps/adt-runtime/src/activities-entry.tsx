/**
 * Standalone activities bundle (activities.bundle.local.js).
 *
 * Shipped in WebPub exports — which strip the full ADT runtime — so interactive
 * activities (quizzes, fill-in-the-blank, sorting, etc.) still work when the
 * book is opened inside a host reader. It reuses the activity initializers from
 * the full runtime but loads only what they need (config, pages manifest,
 * translations) — no reader chrome (TOC, glossary, TTS, sign language) — and
 * renders a minimal Submit/Next control.
 *
 * On success the initializers navigate the page directly (window.location.href
 * to the next reading-order entry). The host reader tracks that page change via
 * the manifest's readingOrder, so no postMessage channel is needed.
 */
import { createRoot } from "react-dom/client"
import {
  Provider as JotaiProvider,
  getDefaultStore,
  useAtomValue,
} from "jotai"
import { loadAppConfig, pickLanguage, pickStorageMode } from "@/shared/runtime/config"
import { loadPagesManifest } from "@/shared/runtime/manifest-loader"
import { loadTranslations } from "@/features/language/runtime/i18n"
import { setStorageMode } from "@/shared/state/persist"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
} from "@/features/navigation/state/nav.atoms"
import {
  activityModeAtom,
  isActivityPageAtom,
  submitEnabledAtom,
  submitLabelAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "@/features/activity/state/activity.atoms"
import { initializeQuizActivity } from "@/features/activity/runtime/activity-quiz"
import { initializeMultiSelectActivity } from "@/features/activity/runtime/activity-multi-select"
import { initializeFillInTheBlankActivity } from "@/features/activity/runtime/activity-fill-in-the-blank"
import { initializeOpenEndedActivity } from "@/features/activity/runtime/activity-open-ended"
import { initializeTrueFalseActivity } from "@/features/activity/runtime/activity-true-false"
import { initializeSortingActivity } from "@/features/activity/runtime/activity-sorting"
import { initializeMatchingActivity } from "@/features/activity/runtime/activity-matching"

const store = getDefaultStore()

/**
 * Minimal Submit / Next control. Reads the same atoms the full runtime's dock
 * button does, but renders an inline-styled button so it doesn't depend on the
 * per-book Tailwind build (which doesn't scan this bundle).
 */
function ActivityControls() {
  const enabled = useAtomValue(submitEnabledAtom)
  const validate = useAtomValue(validateHandlerAtom)
  const state = useAtomValue(submitStateAtom)
  const labelOverride = useAtomValue(submitLabelAtom)

  const label = labelOverride ?? (state === "next" ? "Next" : "Check")
  const disabled = !enabled || !validate

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "1rem",
        display: "flex",
        justifyContent: "center",
        zIndex: 56,
        pointerEvents: "none",
      }}
    >
      <button
        type="button"
        onClick={validate ?? undefined}
        disabled={disabled}
        style={{
          pointerEvents: "auto",
          padding: "0.75rem 1.5rem",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#fff",
          border: "none",
          borderRadius: "0.75rem",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          backgroundColor: state === "next" ? "#059669" : "#2563eb",
        }}
      >
        {label}
      </button>
    </div>
  )
}

function readMeta(name: string): string | null {
  if (typeof document === "undefined") return null
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null
}

/**
 * Slim boot: load only what the activity initializers need, then run them.
 */
async function bootActivities(): Promise<void> {
  const config = await loadAppConfig()
  store.set(appConfigAtom, config)
  setStorageMode(pickStorageMode(config))

  const htmlLang = document.documentElement.getAttribute("lang")
  const language = pickLanguage(config, null, htmlLang)
  store.set(currentLanguageAtom, language)

  const [, pages] = await Promise.all([
    loadTranslations(language, config.bundleVersion),
    loadPagesManifest(config.bundleVersion),
  ])
  store.set(pagesAtom, pages)
  store.set(currentSectionIdAtom, readMeta("title-id"))
  const pageNumberRaw = readMeta("page-section-id")
  const pageNumber = pageNumberRaw ? Number.parseInt(pageNumberRaw, 10) : Number.NaN
  store.set(currentPageNumberAtom, Number.isFinite(pageNumber) ? pageNumber : null)

  store.set(isActivityPageAtom, true)
  store.set(activityModeAtom, true)

  initializeQuizActivity()
  initializeMultiSelectActivity()
  initializeFillInTheBlankActivity()
  initializeOpenEndedActivity()
  initializeTrueFalseActivity()
  initializeSortingActivity()
  initializeMatchingActivity()
}

function ensureContainer(id: string): HTMLElement {
  const existing = document.getElementById(id)
  if (existing) return existing
  const el = document.createElement("div")
  el.id = id
  document.body.appendChild(el)
  return el
}

function mount(): void {
  const container = ensureContainer("nav-container")
  createRoot(container).render(
    <JotaiProvider store={store}>
      <ActivityControls />
    </JotaiProvider>,
  )
  void bootActivities().catch((err) => {
    console.error("ADT activities boot failed", err)
  })
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true })
  } else {
    mount()
  }
}
