/**
 * In-place page navigation ("soft nav") for the served web bundle.
 *
 * Every book page is its own HTML document, so turning a page normally means a
 * full document load: the ~720 KB runtime bundle is re-parsed, both React roots
 * re-mount, and `bootRuntime` re-fetches config + translations + manifests
 * before `#content` is un-hidden. The reader chrome disappears and reappears on
 * every page turn.
 *
 * This module keeps the document — and with it the chrome, the audio element
 * and every atom — alive, swapping only what differs between pages: `<main>`,
 * the page-scoped `<head>` nodes, and the `<body>` presentation attributes.
 * `initializePageContent()` then re-binds the runtime to the new DOM exactly as
 * it does on boot.
 *
 * `file://` keeps the original hard-navigation path (see `canSoftNavigate`), so
 * double-clicking `index.html` behaves exactly as it does today.
 */
import { initializePageContent } from "@/app/lifecycle"
import { announceToScreenReader } from "@/shared/lib/aria-live"
import { trackNavigation, trackSpaPageView } from "@/shared/lib/analytics"

/** Stylesheets shared by every page, matched by filename so the PNLD base
 *  rewrite (`../resources/data/`) still resolves. Never swapped. */
const SHARED_STYLESHEETS = ["tailwind_output.css", "all.min.css", "fonts.css"]

function isSharedStylesheet(href: string | null): boolean {
  if (!href) return false
  const file = href.split("?")[0].split("/").pop() ?? ""
  return SHARED_STYLESHEETS.includes(file)
}

const PAGE_HEAD_ATTR = "data-adt-page-head"

export function claimPageHeadNodes(): void {
  if (typeof document === "undefined") return
  for (const el of Array.from(document.head.querySelectorAll("style:not([data-vite-dev-id])"))) {
    el.setAttribute(PAGE_HEAD_ATTR, "")
  }
}

/**
 * `<head>` nodes belonging to one specific page, which a swap must replace: the
 * title, the metas the runtime reads, the fixed-layout viewport override, and
 * the per-page font/fit `<style>` plus Google Fonts `<link>`s.
 *
 * Deliberately narrow. The head also holds nodes this module must not touch —
 * `<meta charset>`, `<meta name="adt-base">`, the favicons `addFavicons()`
 * injects, the `<link rel="prefetch">` / `speculationrules` that
 * `PagePrefetcher` owns and cleans up itself, and every `<style>` the runtime
 * added after boot (see `PAGE_HEAD_ATTR`). A freshly fetched page only carries
 * its own styles, so on the incoming side every `<style>` is page-scoped.
 */
function isPageScopedHeadNode(el: Element, source: "current" | "incoming"): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === "title") return true
  if (tag === "style") return source === "incoming" || el.hasAttribute(PAGE_HEAD_ATTR)
  if (tag === "meta") {
    const name = el.getAttribute("name")
    return name === "title-id" || name === "page-section-id" || name === "viewport"
  }
  if (tag === "link") {
    const rel = el.getAttribute("rel")
    if (rel === "preconnect") return true
    if (rel === "stylesheet") return !isSharedStylesheet(el.getAttribute("href"))
  }
  return false
}

/**
 * Marker type that stops any engine from running a script on insertion, so
 * `runPageScripts` is the only thing that ever executes one.
 *
 * Whether an imported script auto-executes when it enters the document is a
 * genuinely ambiguous corner of the spec, and engines disagree: Chrome leaves
 * `DOMParser`-sourced scripts inert, jsdom runs them on attach. Neutralising
 * them up front removes the disagreement — without this the generated pages
 * would run their inline scripts once in one engine and twice in the other,
 * and a custom activity would register its grader twice.
 */
const INERT_SCRIPT_TYPE = "application/adt-inert"
const ORIGINAL_TYPE_ATTR = "data-adt-original-type"
/** Marks the body-level scripts this module appends, so the previous page's
 *  copies can be cleared instead of piling up one set per page turn. */
const APPENDED_SCRIPT_ATTR = "data-adt-page-script"

function neutralizeScripts(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll("script:not([src])"))) {
    el.setAttribute(ORIGINAL_TYPE_ATTR, el.getAttribute("type") ?? "")
    el.setAttribute("type", INERT_SCRIPT_TYPE)
  }
}

/**
 * Re-create a neutralised `<script>` in place so it runs exactly once.
 *
 * In place, not hoisted: a custom activity finds its own section with
 * `document.currentScript.closest('section')` (the contract in
 * `activity-generation.ts`), which only resolves while the script sits where
 * it was authored.
 */
function executeScript(source: HTMLScriptElement): void {
  const script = document.createElement("script")
  for (const attr of Array.from(source.attributes)) {
    if (attr.name === "type" || attr.name === ORIGINAL_TYPE_ATTR) continue
    script.setAttribute(attr.name, attr.value)
  }
  const originalType = source.getAttribute(ORIGINAL_TYPE_ATTR)
  if (originalType) script.setAttribute("type", originalType)
  script.text = source.textContent ?? ""
  source.replaceWith(script)
}

/**
 * Restore the parse-time buffering stub for custom activities.
 *
 * On a hard load a custom section's inline script calls the `<head>` stub,
 * because the runtime hasn't booted yet; `initializeCustomActivity()` later
 * drains the buffer into its own closure. After a swap the runtime is already
 * booted, so `window.adtRegisterCustomActivity` still points at the *previous*
 * page's closure — the new section would register its grader against the old
 * page and its Submit button would never enable.
 *
 * Reinstalling the stub before the swap reproduces the document-load ordering:
 * inline scripts buffer, then `initializePageContent()` drains.
 */
function resetCustomActivityRegistrar(): void {
  const queue: NonNullable<typeof window.__adtPendingCustomActivities> = []
  window.__adtPendingCustomActivities = queue
  window.adtRegisterCustomActivity = (section, handlers) => {
    queue.push({ section, handlers })
  }
}

/**
 * True when in-place navigation is safe. `file://` is excluded on purpose:
 * `history.pushState` is rejected for opaque origins, and the hard-navigation
 * path already works there via the inlined offline preloader.
 */
export function canSoftNavigate(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  if (!/^https?:$/.test(window.location.protocol)) return false
  if (typeof window.history?.pushState !== "function") return false
  if (new URLSearchParams(window.location.search).get("embed") === "1") return false
  return true
}

const prefetchedPages = new Set<string>()

export function prefetchPage(href: string): void {
  if (!canSoftNavigate()) return
  const url = new URL(href, window.location.href)
  url.hash = ""
  const current = new URL(window.location.href)
  current.hash = ""
  if (url.href === current.href || prefetchedPages.has(url.href)) return
  prefetchedPages.add(url.href)
  const link = document.createElement("link")
  link.rel = "prefetch"
  link.href = url.href
  document.head.appendChild(link)
}

function swapHead(next: Document): void {
  for (const el of Array.from(document.head.children)) {
    if (isPageScopedHeadNode(el, "current")) el.remove()
  }
  for (const el of Array.from(next.head.children)) {
    if (!isPageScopedHeadNode(el, "incoming")) continue
    const clone = el.cloneNode(true) as Element
    if (clone.tagName.toLowerCase() === "style") clone.setAttribute(PAGE_HEAD_ATTR, "")
    document.head.appendChild(clone)
  }
}

function swapBodyAttributes(next: Document): void {
  document.body.className = next.body.className
  const style = next.body.getAttribute("style")
  if (style) document.body.setAttribute("style", style)
  else document.body.removeAttribute("style")
}

/**
 * Replace `<main>` wholesale rather than just its children — its own classes
 * differ between fixed-layout and reflowable pages.
 */
function swapMain(next: Document): void {
  const current = document.querySelector("main")
  const incoming = next.querySelector("main")
  if (!current || !incoming) return
  current.replaceWith(document.importNode(incoming, true))
}

/**
 * Run the page's inline scripts, in document order, before the initializers
 * look for what they set up.
 *
 * Content-embedded scripts (custom activities) arrived with `<main>` and are
 * sitting inert in the document, so they are re-created in place. Scripts that
 * lived between `</main>` and the bundle tag — `window.correctAnswers` and the
 * fixed-layout fit script — are imported and appended.
 */
function runPageScripts(next: Document): void {
  const main = document.querySelector("main")
  if (main) {
    for (const script of Array.from(
      main.querySelectorAll<HTMLScriptElement>(`script[type="${INERT_SCRIPT_TYPE}"]`),
    )) {
      executeScript(script)
    }
  }

  for (const stale of Array.from(
    document.body.querySelectorAll(`script[${APPENDED_SCRIPT_ATTR}]`),
  )) {
    stale.remove()
  }

  const incomingMain = next.querySelector("main")
  for (const source of Array.from(
    next.body.querySelectorAll<HTMLScriptElement>(`script[type="${INERT_SCRIPT_TYPE}"]`),
  )) {
    if (incomingMain?.contains(source)) continue
    const script = document.importNode(source, true)
    script.setAttribute(APPENDED_SCRIPT_ATTR, "")
    document.body.appendChild(script)
    executeScript(script)
  }
}

/**
 * Move the reading position to the new page and announce it.
 *
 * A document load does both for free; an in-place swap does neither, which
 * leaves assistive tech parked on the button that was clicked with no signal
 * that anything changed (WCAG 4.1.3 Status Messages / 2.4.3 Focus Order).
 *
 * Focus goes to `<main>` rather than the heading so the whole page is in the
 * virtual cursor's path. `<main>` is not interactive, so `:focus-visible` does
 * not match and sighted mouse users see no focus ring.
 */
function moveReadingPosition(): void {
  const main = document.querySelector("main")
  if (!main) return
  main.setAttribute("tabindex", "-1")
  main.focus({ preventScroll: true })

  const heading = main.querySelector("h1")
  const label = (heading?.textContent ?? document.title).trim()
  if (label) announceToScreenReader(label)
}

let inFlight: AbortController | null = null

/**
 * Fetch `href` and swap it into the current document.
 *
 * Resolves `"failed"` when the swap could not be completed, so the caller can
 * fall back to a hard load. `"aborted"` is deliberately distinct: it means a
 * later navigation superseded this one, and falling back would drag the reader
 * back to the page they already navigated away from.
 *
 * With `pushUrl`, the address bar is updated inside the same commit as the DOM.
 * The order matters: `initializePageContent()` runs `processGlossaryLocateHint`,
 * which reads `location.hash` to scroll to a term, so the URL has to be in place
 * before the DOM is re-bound.
 *
 * The fetch goes through the offline preloader's `window.fetch` patch when the
 * bundle ships one, which serves the page from its inlined map — so in
 * offline-capable bundles this is a memory read, not a network round-trip.
 */
export type SwapResult = "ok" | "failed" | "aborted"

interface SoftNavHistoryState {
  adtSoftNav?: boolean
  adtScrollY?: number
}

function readHistoryState(): SoftNavHistoryState {
  const state: unknown = window.history.state
  return state && typeof state === "object" ? (state as SoftNavHistoryState) : {}
}

export async function swapToPage(
  href: string,
  opts: { pushUrl?: boolean; scrollY?: number } = {},
): Promise<SwapResult> {
  inFlight?.abort()
  const controller = new AbortController()
  inFlight = controller

  try {
    const response = await fetch(href, { signal: controller.signal })
    if (!response.ok) return "failed"
    const html = await response.text()
    if (controller.signal.aborted) return "aborted"

    const next = new DOMParser().parseFromString(html, "text/html")
    if (!next.querySelector("main")) return "failed"
    neutralizeScripts(next)

    const fromUrl = window.location.href
    const fromSection =
      document.querySelector('meta[name="title-id"]')?.getAttribute("content") ?? ""
    const toSection =
      next.querySelector('meta[name="title-id"]')?.getAttribute("content") ?? ""

    resetCustomActivityRegistrar()

    const commit = () => {
      if (opts.pushUrl) {
        window.history.replaceState(
          { ...readHistoryState(), adtScrollY: window.scrollY },
          "",
        )
        window.history.pushState({ adtSoftNav: true } satisfies SoftNavHistoryState, "", href)
      }
      swapHead(next)
      swapBodyAttributes(next)
      swapMain(next)
      runPageScripts(next)
      initializePageContent()
      window.scrollTo({ top: opts.scrollY ?? 0, behavior: "instant" })
      moveReadingPosition()
      trackSpaPageView(window.location.href, document.title, fromUrl)
      trackNavigation(fromSection, toSection)
      document.dispatchEvent(
        new CustomEvent("adt:page-changed", {
          detail: { sectionId: toSection || null },
        }),
      )
    }

    const viewTransition = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { finished: Promise<void> }
      }
    ).startViewTransition
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (viewTransition && !reduceMotion) viewTransition.call(document, commit)
    else commit()

    return "ok"
  } catch (err) {
    if (controller.signal.aborted) return "aborted"
    console.warn("ADT soft navigation failed, falling back to a full load", err)
    return "failed"
  } finally {
    if (inFlight === controller) inFlight = null
  }
}

/**
 * Navigate to a book page. Swaps in place when the bundle is served over HTTP,
 * otherwise performs the original full document load.
 *
 * This is the single branch point between the two navigation modes — every
 * `window.location.href = href` page turn in the runtime routes through here.
 */
export function navigateToPage(href: string): void {
  if (!canSoftNavigate()) {
    window.location.href = href
    return
  }

  const target = new URL(href, window.location.href)
  void swapToPage(target.href, { pushUrl: true }).then((result) => {
    if (result === "failed") window.location.href = href
  })
}

/**
 * Back / forward across soft-navigated pages. Installed once from boot;
 * returns its own disposer.
 *
 * Scroll restoration is taken over from the browser: the swap lands the new
 * DOM asynchronously, after the browser would have restored the position onto
 * the old one, so the departing entry's `scrollY` is recorded in its history
 * state and re-applied once the destination page is in place.
 */
export function subscribeSoftNavHistory(): () => void {
  if (!canSoftNavigate()) return () => {}

  const previousScrollRestoration = window.history.scrollRestoration
  window.history.scrollRestoration = "manual"

  const onPopState = (event: PopStateEvent) => {
    const state = (event.state ?? {}) as SoftNavHistoryState
    void swapToPage(window.location.href, { scrollY: state.adtScrollY }).then((result) => {
      if (result === "failed") window.location.reload()
    })
  }

  window.addEventListener("popstate", onPopState)
  return () => {
    window.removeEventListener("popstate", onPopState)
    window.history.scrollRestoration = previousScrollRestoration
  }
}
