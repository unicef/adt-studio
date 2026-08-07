// Pure HTML utilities used by BookPreviewFrame to massage iframe content.

import { AUTO_FIT_SCRIPT_SRC } from "@adt/types"

export function promoteFirstHeadingToH1(html: string): string {
  if (/<h1\b/i.test(html)) return html
  return html.replace(/<h([2-6])(\b[^>]*)>([\s\S]*?)<\/h\1>/i, '<h1$2>$3</h1>')
}

// Inverse of `promoteFirstHeadingToH1`. Used when serializing iframe DOM back
// to persistence so the display-only promote doesn't migrate `<h2>` → `<h1>`
// in the saved rendering.
export function demoteFirstHeadingIfPromoted(
  serialized: string,
  source: string
): string {
  if (/<h1\b/i.test(source)) return serialized
  const m = source.match(/<(h[2-6])\b/i)
  if (!m) return serialized
  const originalTag = m[1].toLowerCase()
  return serialized.replace(
    /<h1(\b[^>]*)>([\s\S]*?)<\/h1>/i,
    `<${originalTag}$1>$2</${originalTag}>`
  )
}

// Serialize a content wrapper for persistence.
//
// A "bare" wrapper — one whose only attribute is `id` — is injected
// scaffolding: the synthetic `<div id="content">` injectContent wraps reflowable
// HTML in, or the `#__root` helper below. It is dropped (innerHTML). A wrapper
// carrying its own attributes (style, data-fl-reference-width, class, …) is the
// content's real container and is preserved (outerHTML). This is what keeps the
// fixed-layout `<div id="content" data-fl-reference-width style>` intact on save
// — previously it vanished because the heuristic only looked for a `class`,
// which fixed-layout wrappers never carry.
//
// For fixed-layout content (`[data-adt-fit]` present), the auto-fit <script>
// the renderer embeds inside `#content` is re-appended so packaged pages still
// load it. It is normally absent by the time we serialize — DOMPurify strips it
// when the preview loads, and the studio shell injects its own body-level copy
// instead — and renderPageHtml does NOT re-inject it at package time, so the
// stored section HTML is the only carrier. The append is still guarded against
// an already-present tag, since a wrapper can reach us from a source DOM that
// never went through DOMPurify. Operates on a detached clone so the (possibly
// live) wrapper is not mutated and the re-added script never executes.
export function serializeContentWrapper(wrapper: Element): string {
  // Only an `id` → injected scaffolding; persist the inner content alone.
  if (wrapper.attributes.length <= 1) return wrapper.innerHTML

  const needsFitScript =
    wrapper.querySelector("[data-adt-fit]") !== null &&
    wrapper.querySelector(`script[src*="auto-fit.js"]`) === null
  if (!needsFitScript) return wrapper.outerHTML

  const clone = wrapper.cloneNode(true) as Element
  const script = clone.ownerDocument.createElement("script")
  script.setAttribute("src", AUTO_FIT_SCRIPT_SRC)
  clone.appendChild(script)
  return clone.outerHTML
}

// Apply a text edit to the original (LaTeX) HTML by splicing the iframe's
// edited innerHTML into the element matching the given data-id. Using innerHTML
// (rather than `textContent = newText`) preserves the inner span structure that
// contentEditable kept intact while the user typed — e.g. fixed-layout
// paragraphs whose words are wrapped in differently coloured `<span>`s. Returns
// the reconstructed wrapper HTML, or null if the element was not found.
export function reconstructHtmlWithEdit(
  originalHtml: string,
  dataId: string,
  editedInnerHtml: string
): string | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div id="__root">${originalHtml}</div>`, "text/html")
    const el = doc.querySelector(`[data-id="${CSS.escape(dataId)}"]`)
    if (!el) return null
    el.innerHTML = editedInnerHtml
    const wrapper = doc.getElementById("content") ?? doc.getElementById("__root")
    if (!wrapper) return null
    return serializeContentWrapper(wrapper)
  } catch {
    return null
  }
}
