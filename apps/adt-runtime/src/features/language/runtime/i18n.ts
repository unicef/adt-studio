/**
 * i18n loader — fetches both the chrome translations
 * (assets/interface_translations/<lang>/interface_translations.json) and the
 * per-page content translations (content/i18n/<lang>/{texts,audios,videos,images}.json),
 * then writes them into Jotai atoms.
 *
 * Direct functional port of `assets/adt/modules/translations.js:fetchTranslations`
 * and `fetchContentFiles`, restructured around atoms.
 */
import { getDefaultStore } from "jotai"
import {
  audioFilesAtom,
  imageFilesAtom,
  translationsAtom,
  videoFilesAtom,
} from "@/features/language/state/language.atoms"
import { applyPlainTextWithLineBreaks } from "./text-formatting"
import { rebuildSegmentedInnerHtml } from "@/shared/lib/fl-segments"

const EASY_READ_FORMATTED_ATTR = "data-easy-read-formatted"
const EASY_READ_PREVIOUS_STYLE_ATTRS = {
  whiteSpace: "data-easy-read-prev-white-space",
  overflowWrap: "data-easy-read-prev-overflow-wrap",
  wordBreak: "data-easy-read-prev-word-break",
  maxWidth: "data-easy-read-prev-max-width",
  display: "data-easy-read-prev-display",
  marginBlockEnd: "data-easy-read-prev-margin-block-end",
} as const

function setEasyReadTextFormatting(element: HTMLElement, enabled: boolean): void {
  if (enabled) {
    if (!element.hasAttribute(EASY_READ_FORMATTED_ATTR)) {
      element.setAttribute(EASY_READ_FORMATTED_ATTR, "true")
      element.setAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.whiteSpace, element.style.whiteSpace)
      element.setAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.overflowWrap, element.style.overflowWrap)
      element.setAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.wordBreak, element.style.wordBreak)
      element.setAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.maxWidth, element.style.maxWidth)
      element.setAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.display, element.style.display)
      element.setAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.marginBlockEnd, element.style.marginBlockEnd)
    }
    element.style.whiteSpace = "pre-line"
    element.style.overflowWrap = "anywhere"
    element.style.wordBreak = "normal"
    element.style.maxWidth = "100%"
    if (element.tagName.toLowerCase() === "span" && element.closest("p")) {
      element.style.display = "block"
      element.style.marginBlockEnd = "0.85em"
    }
    return
  }

  if (element.hasAttribute(EASY_READ_FORMATTED_ATTR)) {
    element.removeAttribute(EASY_READ_FORMATTED_ATTR)
    element.style.whiteSpace = element.getAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.whiteSpace) ?? ""
    element.style.overflowWrap =
      element.getAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.overflowWrap) ?? ""
    element.style.wordBreak = element.getAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.wordBreak) ?? ""
    element.style.maxWidth = element.getAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.maxWidth) ?? ""
    element.style.display = element.getAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.display) ?? ""
    element.style.marginBlockEnd =
      element.getAttribute(EASY_READ_PREVIOUS_STYLE_ATTRS.marginBlockEnd) ?? ""
    Object.values(EASY_READ_PREVIOUS_STYLE_ATTRS).forEach((attr) => {
      element.removeAttribute(attr)
    })
  }
}

async function safeJsonFetch<T = unknown>(
  url: string,
  context: string,
): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[i18n] ${context}: ${url} returned ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[i18n] failed to load ${url}`, err)
    return null
  }
}

async function loadInterfaceTranslations(
  lang: string,
  versionParam: string,
): Promise<Record<string, string>> {
  const url = `./assets/interface_translations/${lang}/interface_translations.json${versionParam}`
  const data = await safeJsonFetch<Record<string, string>>(url, "interface translations")
  return data ?? {}
}

interface ContentBundle {
  texts: Record<string, string>
  audios: Record<string, string>
  videos: Record<string, string>
  images: Record<string, string>
}

async function loadContentFiles(
  lang: string,
  versionParam: string,
): Promise<ContentBundle> {
  const base = `./content/i18n/${lang}`
  const [texts, audios, videos, images] = await Promise.all([
    safeJsonFetch<Record<string, string>>(`${base}/texts.json${versionParam}`, "texts.json"),
    safeJsonFetch<Record<string, string>>(`${base}/audios.json${versionParam}`, "audios.json"),
    safeJsonFetch<Record<string, string>>(`${base}/videos.json${versionParam}`, "videos.json"),
    safeJsonFetch<Record<string, string>>(`${base}/images.json${versionParam}`, "images.json"),
  ])
  return {
    texts: texts ?? {},
    audios: audios ?? {},
    videos: videos ?? {},
    images: images ?? {},
  }
}

export interface LoadTranslationsResult {
  interface: Record<string, string>
  content: ContentBundle
}

/**
 * Load both interface and content catalogs for a language and write them to
 * the relevant atoms. Replaces the side-effect of `fetchTranslations` from
 * the legacy runtime.
 */
export async function loadTranslations(
  lang: string,
  bundleVersion?: string,
): Promise<LoadTranslationsResult> {
  const versionParam = bundleVersion ? `?v=${bundleVersion}` : ""

  const [interfaceData, content] = await Promise.all([
    loadInterfaceTranslations(lang, versionParam),
    loadContentFiles(lang, versionParam),
  ])

  const store = getDefaultStore()
  // Interface keys + content text keys live in the same translation map (legacy
  // shape); content keys override interface keys with the same id, just like
  // the original spread order.
  store.set(translationsAtom, { ...interfaceData, ...content.texts })
  store.set(audioFilesAtom, content.audios)
  store.set(videoFilesAtom, content.videos)
  // Replace (don't merge) imageFiles so switching to a language without an
  // image variant correctly falls back to the original src.
  store.set(imageFilesAtom, content.images)

  return { interface: interfaceData, content }
}

/**
 * Apply translations to the static `#content` DOM. The content HTML ships
 * with `data-id="..."` markers on each text span; this swaps in the translated
 * text and updates `<img alt>` / placeholders / page <title>.
 *
 * Easy-read mode is handled by preferring `${id}_easy_read` keys for paragraphs
 * (skipping headers, nav items, activity options, and word cards — see the
 * legacy applyTranslationToElements logic for the full exclusion list).
 */
export function applyTranslationsToDOM(
  translations: Record<string, string>,
  options: { easyReadMode: boolean } = { easyReadMode: false },
): void {
  if (typeof document === "undefined") return

  for (const [key, value] of Object.entries(translations)) {
    if (key.endsWith("_eli5") || key.endsWith("_easy_read")) continue

    let translationKey = key
    if (options.easyReadMode) {
      const easyReadKey = `${key}_easy_read`
      if (translations[easyReadKey] !== undefined) {
        const elements = document.querySelectorAll(`[data-id="${cssEscape(key)}"]`)
        const isHeaderOrExcluded = Array.from(elements).some((el) => {
          const tag = el.tagName.toLowerCase()
          if (/^h[1-6]$/.test(tag)) return true
          return Boolean(
            el.closest(".word-card") ||
              el.closest("[data-activity-item]") ||
              el.closest(".activity-text") ||
              el.closest("nav"),
          )
        })
        if (!isHeaderOrExcluded) translationKey = easyReadKey
      }
    }

    const text = translations[translationKey] ?? value
    if (text === undefined) continue

    const elements = document.querySelectorAll(`[data-id="${cssEscape(key)}"]`)
    const isEasyRead = translationKey.endsWith("_easy_read")
    const renderedHtml = text.replace(/\n/g, "<br>")
    elements.forEach((el) => {
      if (el.tagName === "IMG") {
        el.setAttribute("alt", text)
        return
      }
      const htmlElement = el as HTMLElement
      // Easy Read is a new content mode: toggle its inline formatting on
      // every element (the helper restores prior styles when disabled, so
      // this is a no-op for the normal path) before swapping text.
      setEasyReadTextFormatting(htmlElement, isEasyRead)
      if (isEasyRead) {
        // Easy Read replaces the styled run tree with plain wrapped text, so
        // the cached TTS markup no longer applies — drop it.
        htmlElement.removeAttribute("data-tts-original-html")
        applyPlainTextWithLineBreaks(htmlElement, text)
        return
      }
      // Fixed-layout paragraphs carry per-run styling on `data-segments`.
      // Rebuild the styled-span tree from that JSON so font-family, color,
      // size, weight, and stroke survive the text swap — straight innerHTML
      // assignment would flatten them.
      const segmentsAttr = htmlElement.getAttribute("data-segments")
      const html = segmentsAttr
        ? rebuildSegmentedInnerHtml(segmentsAttr, renderedHtml)
        : renderedHtml
      if (htmlElement.hasAttribute("data-tts-original-html")) {
        htmlElement.setAttribute("data-tts-original-html", html)
      }
      htmlElement.innerHTML = html
    })

    const placeholders = document.querySelectorAll(
      `[data-placeholder-id="${cssEscape(key)}"]`,
    )
    placeholders.forEach((el) => {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.setAttribute("placeholder", text)
      }
    })
  }

  // Update <title> if the page declares a title-id meta.
  const titleMeta = document.querySelector('meta[name="title-id"]')
  if (titleMeta) {
    const id = titleMeta.getAttribute("content")
    if (id && translations[id]) document.title = translations[id]
  }

  // Re-run fixed-layout auto-fit after rebuilding segment spans — the new
  // elements have no `data-adt-fs` cache and the translated content has a
  // different length than the source, so an earlier auto-fit pass against
  // the original spans no longer reflects the rendered DOM. Double-rAF so
  // we measure after the browser has laid out the new innerHTML.
  const runAutoFit = (window as Window & { __adtRunAutoFit?: () => void })
    .__adtRunAutoFit
  if (typeof runAutoFit === "function") {
    requestAnimationFrame(() => requestAnimationFrame(() => runAutoFit()))
  }
}

/**
 * Apply localized image variants from `imageFilesAtom` to `<img data-id>`
 * elements. Stores the original `src` on first apply so unknown languages
 * fall back to the source image cleanly.
 */
export function applyImageVariants(variants: Record<string, string>): void {
  if (typeof document === "undefined") return
  document.querySelectorAll<HTMLImageElement>("img[data-id]").forEach((img) => {
    const id = img.getAttribute("data-id")
    if (!id) return
    if (!img.dataset.originalSrc) img.dataset.originalSrc = img.getAttribute("src") ?? ""
    const variantFilename = variants[id]
    if (variantFilename) {
      const next = `images/${variantFilename}`
      if (img.getAttribute("src") !== next) img.setAttribute("src", next)
    } else if (img.dataset.originalSrc && img.getAttribute("src") !== img.dataset.originalSrc) {
      img.setAttribute("src", img.dataset.originalSrc)
    }
  })
}

/**
 * Minimal CSS attribute-value escape for use inside `[data-id="…"]` selectors.
 * Browsers ship `CSS.escape`, but it's not safe to assume in older webviews —
 * the legacy runtime hits the same constraint.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value)
  return value.replace(/(["\\])/g, "\\$1")
}
