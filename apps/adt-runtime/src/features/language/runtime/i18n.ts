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
import { runtimeBase } from "@/shared/runtime/base-path.js"
import {
  audioFilesAtom,
  speechTextsAtom,
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

function hasUnderlineOptionDescendants(element: HTMLElement): boolean {
  return !!element.querySelector(".activity-underline-option[data-activity-item]")
}

function replaceTextPreservingUnderlineOptions(
  element: HTMLElement,
  translatedText: string,
): void {
  const options = Array.from(
    element.querySelectorAll<HTMLElement>(".activity-underline-option[data-activity-item]"),
  )
  if (options.length === 0) {
    element.innerHTML = translatedText.replace(/\n/g, "<br>")
    return
  }

  const wordMatches = Array.from(
    translatedText.matchAll(/\p{L}[\p{L}\p{M}'’‘-]*/gu),
  )

  // If the translated text no longer maps cleanly to the existing clickable
  // word count, keep the authored interactive DOM intact instead of flattening
  // it into plain text and breaking the activity.
  if (wordMatches.length !== options.length) return

  const doc = element.ownerDocument
  if (!doc) return

  const fragment = doc.createDocumentFragment()
  let lastIndex = 0
  for (let i = 0; i < wordMatches.length; i += 1) {
    const match = wordMatches[i]
    const word = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) {
      fragment.append(doc.createTextNode(translatedText.slice(lastIndex, start)))
    }
    // The activity runtime appends an aria-hidden check/cross mark inside the
    // token after validation; re-attach it so the text swap doesn't strip the
    // non-color verdict indicator while the inline verdict colors persist.
    const verdictMark = options[i].querySelector("[data-underline-verdict-mark]")
    options[i].textContent = word
    if (verdictMark) options[i].append(verdictMark)
    fragment.append(options[i])
    lastIndex = start + word.length
  }
  if (lastIndex < translatedText.length) {
    fragment.append(doc.createTextNode(translatedText.slice(lastIndex)))
  }

  element.replaceChildren(fragment)
}

interface TocTextParts {
  title: string
  leader: string
  separator: string
  pageNumber: string
}

function splitTocText(text: string): TocTextParts | null {
  const dotted = text.match(/^(.*?)(\.(?:\s*\.)+)(\s*)([ivxlcdm]+|\d+)\s*$/i)
  if (dotted) {
    return {
      title: dotted[1],
      leader: dotted[2],
      separator: dotted[3],
      pageNumber: dotted[4],
    }
  }
  const merged = text.match(/^(.*?\D)(\s*)([ivxlcdm]+|\d+)\s*$/i)
  if (!merged?.[1].trim()) return null
  return {
    title: merged[1],
    leader: "",
    separator: merged[2],
    pageNumber: merged[3],
  }
}

/** Preserve the title/leader/page-number spans created for TOC rows. Generic
 * innerHTML replacement would flatten the row as soon as language data loads. */
function replaceTextPreservingTocLayout(
  element: HTMLElement,
  translatedText: string,
): boolean {
  if (!element.closest('section[data-section-type="table_of_contents"]')) return false

  const title =
    element.querySelector<HTMLElement>(":scope > [data-toc-title]") ??
    (element.firstElementChild as HTMLElement | null)
  const leader =
    element.querySelector<HTMLElement>(":scope > [data-toc-leader]") ??
    element.querySelector<HTMLElement>(":scope > [aria-hidden='true'][class*='border-dotted']")
  const pageNumber =
    element.querySelector<HTMLElement>(":scope > [data-toc-page-number]") ??
    (element.lastElementChild as HTMLElement | null)

  if (!title || !leader || !pageNumber || title === pageNumber) return false
  const parts = splitTocText(translatedText)
  if (!parts) {
    title.textContent = translatedText
    return true
  }

  title.textContent = parts.leader ? parts.title : parts.title + parts.separator
  pageNumber.textContent = parts.leader
    ? parts.separator + parts.pageNumber
    : parts.pageNumber
  const srOnly = leader.querySelector<HTMLElement>(".sr-only")
  if (srOnly) srOnly.textContent = parts.leader
  return true
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
  const url = `${runtimeBase()}assets/interface_translations/${lang}/interface_translations.json${versionParam}`
  const data = await safeJsonFetch<Record<string, string>>(url, "interface translations")
  return data ?? {}
}

interface ContentBundle {
  texts: Record<string, string>
  speechTexts: Record<string, string>
  audios: Record<string, string>
  videos: Record<string, string>
  images: Record<string, string>
}

async function loadContentFiles(
  lang: string,
  versionParam: string,
): Promise<ContentBundle> {
  const base = `${runtimeBase()}content/i18n/${lang}`
  const [texts, speechTexts, audios, videos, images] = await Promise.all([
    safeJsonFetch<Record<string, string>>(`${base}/texts.json${versionParam}`, "texts.json"),
    safeJsonFetch<Record<string, string>>(`${base}/speech_texts.json${versionParam}`, "speech_texts.json"),
    safeJsonFetch<Record<string, string>>(`${base}/audios.json${versionParam}`, "audios.json"),
    safeJsonFetch<Record<string, string>>(`${base}/videos.json${versionParam}`, "videos.json"),
    safeJsonFetch<Record<string, string>>(`${base}/images.json${versionParam}`, "images.json"),
  ])
  return {
    texts: texts ?? {},
    speechTexts: speechTexts ?? {},
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
  store.set(speechTextsAtom, content.speechTexts)
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
      // Step-by-step activities render their own React-managed DOM (with
      // inputs inside sentence texts) and translate through the same dict —
      // rewriting their innerHTML here would destroy the inputs.
      if (el.closest("[data-stepper-root]")) return
      if (el.tagName === "IMG") {
        el.setAttribute("alt", text)
        return
      }
      const htmlElement = el as HTMLElement
      if (replaceTextPreservingTocLayout(htmlElement, text)) return
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
      if (!segmentsAttr && hasUnderlineOptionDescendants(htmlElement)) {
        replaceTextPreservingUnderlineOptions(htmlElement, text)
        return
      }
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
