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

interface ElementPathSegment {
  tagName: string
  indexAmongTag: number
}

/**
 * Describe an element's location without relying on transient preview ids.
 * Indexing among siblings with the same tag keeps the path stable when
 * DOMPurify removes a sibling <script> before the preview is injected.
 */
function elementPath(root: Element, target: Element): ElementPathSegment[] | null {
  if (root === target || !root.contains(target)) return null
  const reversed: ElementPathSegment[] = []
  let current = target

  while (current !== root) {
    const parent = current.parentElement
    if (!parent) return null
    const tagName = current.tagName.toLowerCase()
    const sameTagSiblings = Array.from(parent.children).filter(
      (child) => child.tagName.toLowerCase() === tagName
    )
    const indexAmongTag = sameTagSiblings.indexOf(current)
    if (indexAmongTag < 0) return null
    reversed.push({ tagName, indexAmongTag })
    current = parent
  }

  return reversed.reverse()
}

function elementAtPath(root: Element, path: ElementPathSegment[]): Element | null {
  let current = root
  for (const segment of path) {
    const matches = Array.from(current.children).filter(
      (child) => child.tagName.toLowerCase() === segment.tagName
    )
    const next = matches[segment.indexAmongTag]
    if (!next) return null
    current = next
  }
  return current
}

/**
 * Remove a transiently-addressed preview element from the persistence source.
 * The live iframe contains sanitized HTML and display-only MathML, so
 * serializing it would drop custom-activity scripts and replace source LaTeX.
 */
export function removeElementFromSourceHtml(
  sourceHtml: string,
  liveRoot: Element,
  liveTarget: Element
): { html: string; removedDataIds: string[] } | null {
  const path = elementPath(liveRoot, liveTarget)
  if (!path) return null

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="__root">${sourceHtml}</div>`, "text/html")
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Internal DOM id, not user-visible
  const syntheticRoot = doc.getElementById("__root")
  if (!syntheticRoot) return null
  const sourceRoot = doc.getElementById("content") ?? syntheticRoot
  const sourceTarget = elementAtPath(sourceRoot, path)
  if (!sourceTarget) return null

  const liveDataIds = Array.from(liveTarget.querySelectorAll("[data-id]"))
    .map((node) => node.getAttribute("data-id"))
    .filter((id): id is string => !!id && !/^_el\d+$/.test(id))
  if (
    liveDataIds.some(
      (id) => sourceTarget.querySelector(`[data-id="${CSS.escape(id)}"]`) === null
    )
  ) {
    return null
  }

  const removedDataIds = [sourceTarget, ...Array.from(sourceTarget.querySelectorAll("[data-id]"))]
    .map((node) => node.getAttribute("data-id"))
    .filter((id): id is string => !!id && !/^_el\d+$/.test(id))
  sourceTarget.remove()

  return {
    html: serializeContentWrapper(sourceRoot),
    removedDataIds,
  }
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
    // eslint-disable-next-line lingui/no-unlocalized-strings -- Internal DOM id, not user-visible
    const wrapper = doc.getElementById("content") ?? doc.getElementById("__root")
    if (!wrapper) return null
    return serializeContentWrapper(wrapper)
  } catch {
    return null
  }
}
