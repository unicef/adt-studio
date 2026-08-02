/**
 * Boot lifecycle — orchestrates the same sequence base.js used to run on
 * `DOMContentLoaded`, but expressed as a single async function that yields
 * back to React for rendering.
 *
 * Sequence:
 *   1. addFavicons()
 *   2. loadAppConfig() → window.appConfig + appConfigAtom
 *   3. setStorageMode() — picks cookie vs localStorage based on the config
 *   4. Resolve current language against config + persisted preference
 *   5. loadTranslations() — interface + content catalogs
 *   6. loadPagesManifest(), loadTocManifest()
 *   7. resolveCurrentSection() from <meta name="title-id">
 *   8. initAnalytics() — fire and forget
 *   9. installShowContentFallback() — safety net
 */
import { getDefaultStore } from "jotai"
import { addFavicons } from "@/shared/runtime/favicon"
import { loadAppConfig, pickLanguage, pickStorageMode } from "@/shared/runtime/config"
import { applyImageVariants, applyTranslationsToDOM, loadTranslations } from "@/features/language/runtime/i18n"
import { loadPagesManifest, loadTocManifest } from "@/shared/runtime/manifest-loader"
import { loadGlossary } from "@/features/glossary/runtime/glossary-loader"
import { loadTimecodes } from "@/features/audio/runtime/tts-loader"
import { hasPersistedValue, setStorageMode } from "@/shared/state/persist"
import {
  appConfigAtom,
  isSettingLocked,
  type AppConfig,
  type LockableSetting,
} from "@/shared/state/config.atoms"
import {
  currentLanguageAtom,
  imageFilesAtom,
  translationsAtom,
} from "@/features/language/state/language.atoms"
import {
  dockAlignAtom,
  dockPositionAtom,
  dockReadyAtom,
  dockWidthAtom,
  easyReadModeAtom,
  embedModeAtom,
  glossaryModeAtom,
  iconSizeAtom,
  reduceMotionAtom,
  themeAtom,
} from "@/shared/state/ui.atoms"
import { glossaryDataAtom } from "@/features/glossary/state/glossary.atoms"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
  tocAtom,
} from "@/features/navigation/state/nav.atoms"
import {
  applyGlossaryHighlights,
  removeGlossaryHighlights,
} from "@/features/glossary/lib/highlight"
import { locateGlossaryTerm } from "@/features/glossary/lib/locate"
import { initAnalytics } from "@/shared/lib/analytics"
import { installShowContentFallback, showMainContent } from "@/shared/lib/errors"
import { activityModeAtom, isActivityPageAtom } from "@/features/activity/state/activity.atoms"
import { initializeQuizActivity } from "@/features/activity/runtime/activity-quiz"
import { initializeMultiSelectActivity } from "@/features/activity/runtime/activity-multi-select"
import { initializeFillInTheBlankActivity } from "@/features/activity/runtime/activity-fill-in-the-blank"
import { initializeOpenEndedActivity } from "@/features/activity/runtime/activity-open-ended"
import { initializeTrueFalseActivity } from "@/features/activity/runtime/activity-true-false"
import { initializeSortingActivity } from "@/features/activity/runtime/activity-sorting"
import { initializeMatchingActivity } from "@/features/activity/runtime/activity-matching"

function readCurrentSectionId(): string | null {
  if (typeof document === "undefined") return null
  return (
    document.querySelector('meta[name="title-id"]')?.getAttribute("content") ?? null
  )
}

function readIsActivityPage(): boolean {
  if (typeof document === "undefined") return false
  return !!document.querySelector('section[data-section-type^="activity_"]')
}

function readIsEmbedMode(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("embed") === "1"
}

function readCurrentPageNumber(): number | null {
  const meta = document
    .querySelector('meta[name="page-section-id"]')
    ?.getAttribute("content")
  const num = meta ? Number.parseInt(meta, 10) : Number.NaN
  return Number.isFinite(num) ? num : null
}

/**
 * Apply `defaultSettings` and `lockedSettings` from the loaded config.
 *
 * For each setting: when locked, the configured default (or the atom's
 * hardcoded fallback) is written every boot — the picker is hidden in this
 * case so the author's value must win. When unlocked, the configured default
 * only seeds the atom if the reader hasn't already chosen a value in storage.
 */
function applyConfiguredSettings(config: AppConfig): void {
  const store = getDefaultStore()
  const defaults = config.defaultSettings
  const seed = <T>(
    key: LockableSetting,
    storageKey: string,
    atom: Parameters<typeof store.set>[0],
    value: T | undefined,
  ): void => {
    const locked = isSettingLocked(config, key)
    if (locked && value !== undefined) {
      store.set(atom as never, value as never)
    } else if (!locked && value !== undefined && !hasPersistedValue(storageKey)) {
      store.set(atom as never, value as never)
    }
  }

  seed("dockLayout", "dockWidth", dockWidthAtom, defaults?.dockLayout?.width)
  seed(
    "dockLayout",
    "dockPosition",
    dockPositionAtom,
    defaults?.dockLayout?.position,
  )
  seed("dockLayout", "dockAlign", dockAlignAtom, defaults?.dockLayout?.align)
  seed("theme", "theme", themeAtom, defaults?.theme)
  seed("iconSize", "iconSize", iconSizeAtom, defaults?.iconSize)
  seed("reduceMotion", "reduceMotion", reduceMotionAtom, defaults?.reduceMotion)
}

function readPersistedLanguage(): string | null {
  if (typeof document === "undefined") return null
  const fromLs =
    typeof localStorage !== "undefined" ? localStorage.getItem("currentLanguage") : null
  const fromCookie = (() => {
    const match = document.cookie.match(/(?:^|;\s*)currentLanguage=([^;]+)/)
    return match ? decodeURIComponent(match[1]) : null
  })()
  const raw = fromLs ?? fromCookie
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === "string" ? parsed : raw
  } catch {
    return raw
  }
}

export async function bootRuntime(): Promise<void> {
  installShowContentFallback()
  addFavicons()

  const store = getDefaultStore()
  try {
    const config = await loadAppConfig()
    store.set(appConfigAtom, config)
    setStorageMode(pickStorageMode(config))
    applyConfiguredSettings(config)

    const htmlLang = document.documentElement.getAttribute("lang")
    const persisted = readPersistedLanguage()
    const language = pickLanguage(config, persisted, htmlLang)
    store.set(currentLanguageAtom, language)
    // WCAG 3.1.1: keep `<html lang>` aligned with the resolved language so
    // screen readers / hyphenation / spellcheck use the right pronunciation.
    document.documentElement.lang = language

    const [, pages, toc] = await Promise.all([
      loadTranslations(language, config.bundleVersion),
      loadPagesManifest(config.bundleVersion),
      loadTocManifest(config.bundleVersion),
      loadGlossary(language, config.bundleVersion),
      loadTimecodes(language, config.bundleVersion),
    ])
    store.set(pagesAtom, pages)
    store.set(tocAtom, toc)
    store.set(currentSectionIdAtom, readCurrentSectionId())
    store.set(currentPageNumberAtom, readCurrentPageNumber())
    // Page-type signal (fixed for the document) + initial mode toggle.
    const isActivity = readIsActivityPage()
    store.set(isActivityPageAtom, isActivity)
    store.set(activityModeAtom, isActivity)
    store.set(embedModeAtom, readIsEmbedMode())

    applyDOMTranslations()

    initAnalytics(config.analytics)
    showMainContent()
    processGlossaryLocateHint()
    initializeQuizActivity()
    initializeMultiSelectActivity()
    initializeFillInTheBlankActivity()
    initializeOpenEndedActivity()
    initializeTrueFalseActivity()
    initializeSortingActivity()
    initializeMatchingActivity()
  } finally {
    // Always clear the dock skeleton — even on partial-load failures the dock
    // should reveal whatever data DID make it into atoms.
    store.set(dockReadyAtom, true)
  }
}

function processGlossaryLocateHint(): void {
  if (typeof window === "undefined") return
  const match = window.location.hash.match(/^#glossary=(.+)$/)
  if (!match) return
  const word = decodeURIComponent(match[1])
  history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  )

  const store = getDefaultStore()
  const entry = store.get(glossaryDataAtom)[word]
  if (!entry) return

  // The browser's default scroll restoration competes with our
  // scrollIntoView at load time; opt out for this navigation.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual"

  // Wait until the page has finished loading (images, fonts) so the
  // term's final layout position is stable before we scroll/flash.
  const run = () => {
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    const ready = fonts?.ready ?? Promise.resolve()
    ready.then(() => requestAnimationFrame(() => locateGlossaryTerm(entry)))
  }
  if (document.readyState === "complete") run()
  else window.addEventListener("load", run, { once: true })
}

/**
 * Apply the latest translations + image variants to the static content DOM,
 * then re-apply glossary highlights when the toggle is on.
 *
 * Order matters: `applyTranslationsToDOM` rewrites `innerHTML` of every
 * `[data-id]` element, which would otherwise destroy any glossary highlight
 * spans nested inside them. Running the highlighter as the final step makes
 * sure the visible state is "translated text + highlighted terms" regardless
 * of the order in which the translation / glossary fetches resolve.
 *
 * Reads atom state at call time so it can be triggered both on boot and
 * whenever the language / easy-read toggle changes.
 */
function applyDOMTranslations(): void {
  const store = getDefaultStore()
  const translations = store.get(translationsAtom)
  const images = store.get(imageFilesAtom)
  const easyReadMode = store.get(easyReadModeAtom) as boolean
  applyTranslationsToDOM(translations, { easyReadMode })
  applyImageVariants(images)

  const glossaryEnabled = store.get(glossaryModeAtom) as boolean
  if (glossaryEnabled) {
    const glossaryData = store.get(glossaryDataAtom)
    // Always wipe stale spans first so a re-apply (e.g. on language change)
    // doesn't compound or skip already-marked base forms.
    removeGlossaryHighlights()
    if (Object.keys(glossaryData).length > 0) {
      applyGlossaryHighlights(glossaryData)
    }
  }
}

/**
 * Subscribe to language and easy-read changes after boot. When the user picks
 * a new language from the sidebar, reload translations and re-apply them to
 * the static content DOM without a full page navigation. Easy-read toggling
 * just re-applies (no re-fetch needed — both variants live in the same dict).
 */
export function subscribeLanguageChanges(): () => void {
  const store = getDefaultStore()
  // currentLanguageAtom is sync (atomWithStorage with getOnInit), but the
  // Jotai type still includes Promise<T> in its read signature; cast away.
  let lastLanguage = store.get(currentLanguageAtom) as string

  const unsubLanguage = store.sub(currentLanguageAtom, () => {
    const next = store.get(currentLanguageAtom) as string
    if (next === lastLanguage) return
    lastLanguage = next
    // WCAG 3.1.2: re-tag the document so assistive tech adjusts to the
    // new language alongside the translated content.
    if (typeof document !== "undefined") document.documentElement.lang = next
    const config = store.get(appConfigAtom)
    void Promise.all([
      loadTranslations(next, config.bundleVersion),
      loadGlossary(next, config.bundleVersion),
      loadTimecodes(next, config.bundleVersion),
    ]).then(() => applyDOMTranslations())
  })

  const unsubEasyRead = store.sub(easyReadModeAtom, () => applyDOMTranslations())

  return () => {
    unsubLanguage()
    unsubEasyRead()
  }
}

/**
 * When the runtime is mounted inside a Studio preview iframe, post a snapshot
 * of the reader-customization atoms (dock layout, theme, icon size, reduce
 * motion) to `window.parent` on boot and on every change. Studio uses these
 * to seed the exported web ADT's `defaultSettings`.
 *
 * No-op when the runtime is standalone (file://, exported HTTP) — there's no
 * parent listening.
 */
export function subscribePreviewSettings(): () => void {
  if (typeof window === "undefined") return () => {}
  if (window.parent === window) return () => {}

  const bookLabelMatch = window.location.pathname.match(/\/books\/([^/]+)\//)
  if (!bookLabelMatch) return () => {}
  const bookLabel = bookLabelMatch[1]

  const store = getDefaultStore()

  const snapshot = (): void => {
    window.parent.postMessage(
      {
        type: "adt-runtime/preview-settings",
        bookLabel,
        settings: {
          dockLayout: {
            width: store.get(dockWidthAtom) as string,
            position: store.get(dockPositionAtom) as string,
            align: store.get(dockAlignAtom) as string,
          },
          theme: store.get(themeAtom) as string,
          iconSize: store.get(iconSizeAtom) as string,
          reduceMotion: store.get(reduceMotionAtom) as boolean,
        },
      },
      "*",
    )
  }

  snapshot()

  const unsubs = [
    store.sub(dockWidthAtom, snapshot),
    store.sub(dockPositionAtom, snapshot),
    store.sub(dockAlignAtom, snapshot),
    store.sub(themeAtom, snapshot),
    store.sub(iconSizeAtom, snapshot),
    store.sub(reduceMotionAtom, snapshot),
  ]

  return () => {
    for (const unsub of unsubs) unsub()
  }
}
