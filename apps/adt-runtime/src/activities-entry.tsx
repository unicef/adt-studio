/**
 * Standalone activities bundle (activities.bundle.local.js).
 *
 * Shipped in WebPub exports — which strip the full ADT runtime — so interactive
 * activities (quizzes, fill-in-the-blank, sorting, etc.) still work when the
 * book is opened inside a host reader. It reuses the activity initializers AND
 * the real Submit/Next button (DockActivityActions) from the full runtime, but
 * loads only what they need (config, pages manifest, translations) — no reader
 * chrome (TOC, glossary, TTS, sign language).
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
import { Toaster } from "sonner"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { DockActivityActions } from "@/features/activity/components/DockActivityActions"
import { ActivityConfetti } from "@/features/activity/components/ActivityConfetti"
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
import { activityModeAtom, isActivityPageAtom, submitStateAtom } from "@/features/activity/state/activity.atoms"
import { initializeQuizActivity } from "@/features/activity/runtime/activity-quiz"
import { initializeMultiSelectActivity } from "@/features/activity/runtime/activity-multi-select"
import { initializeUnderlineTextActivity } from "@/features/activity/runtime/activity-underline-text"
import { initializeFillInTheBlankActivity } from "@/features/activity/runtime/activity-fill-in-the-blank"
import { initializeOpenEndedActivity } from "@/features/activity/runtime/activity-open-ended"
import { initializeTrueFalseActivity } from "@/features/activity/runtime/activity-true-false"
import { initializeSortingActivity } from "@/features/activity/runtime/activity-sorting"
import { initializeMatchingActivity } from "@/features/activity/runtime/activity-matching"
import { initializeCustomActivity } from "@/features/activity/runtime/activity-custom"

const store = getDefaultStore()

/**
 * Fixed-position shell around the shared Submit/Next button. (The full runtime's
 * positioning lives in ActivityDock, which is coupled to the dock context; here
 * we only need a minimal centered container.)
 */
function ActivityControls() {
  const activityMode = useAtomValue(activityModeAtom)
  const submitState = useAtomValue(submitStateAtom)
  if (!activityMode) return null
  // Host readers (EPUB in Apple Books/Thorium, WebPub) have their own page
  // navigation, so we don't surface the post-answer "Next" button the full web
  // reader shows — only the "Submit" control that activities need to validate.
  if (submitState === "next") return null
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
      }}
    >
      <DockActivityActions />
    </div>
  )
}

function readMeta(name: string): string | null {
  if (typeof document === "undefined") return null
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null
}

function readIsActivityPage(): boolean {
  if (typeof document === "undefined") return false
  return !!document.querySelector('section[data-section-type^="activity_"]')
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

  const isActivity = readIsActivityPage()
  store.set(isActivityPageAtom, isActivity)
  store.set(activityModeAtom, isActivity)

  initializeQuizActivity()
  initializeMultiSelectActivity()
  initializeUnderlineTextActivity()
  initializeFillInTheBlankActivity()
  initializeOpenEndedActivity()
  initializeTrueFalseActivity()
  initializeSortingActivity()
  initializeMatchingActivity()
  // Custom (`activity_custom_*`) sections register their grader through
  // window.adtRegisterCustomActivity. injectActivitiesBundle ships this bundle
  // to those pages too, so it must drain the buffer here as well — otherwise
  // Submit renders but stays disabled in EPUB/WebPub exports.
  initializeCustomActivity()
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
      <TooltipProvider delay={300} closeDelay={120}>
        <ActivityControls />
        <ActivityConfetti />
      </TooltipProvider>
      <Toaster position="top-center" richColors closeButton />
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
