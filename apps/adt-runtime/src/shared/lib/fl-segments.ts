/**
 * Fixed-layout paragraph segment helpers.
 *
 * FL `[data-id]` paragraphs carry per-run styling on `data-segments` — JSON
 * mirroring `SectionTextSegment` in `@adt/types`. Two consumers in this
 * runtime walk that JSON:
 *
 *   - `features/audio/lib/word-highlight.ts` rebuilds nested styled spans
 *     inside each word wrapper during read-aloud, so word highlighting
 *     doesn't flatten the renderer's per-run colour / font / size.
 *
 *   - `features/language/runtime/i18n.ts` rebuilds the styled span tree
 *     after a translation swap (which otherwise pastes plain text into
 *     `innerHTML`).
 */

export interface Segment {
  text: string
  style?: Record<string, string>
}

export function parseSegments(attr: string | null): Segment[] | null {
  if (!attr) return null
  try {
    const parsed: unknown = JSON.parse(attr)
    if (!Array.isArray(parsed)) return null
    const out: Segment[] = []
    for (const s of parsed) {
      if (!s || typeof s !== "object" || typeof (s as Segment).text !== "string") return null
      out.push({ text: (s as Segment).text, style: (s as Segment).style })
    }
    return out
  } catch {
    return null
  }
}

export function styleToInline(style: Record<string, string> | undefined): string {
  if (!style) return ""
  return Object.entries(style)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Build the inner HTML for a `[data-id][data-segments]` paragraph from a
 * (possibly translated) text string. When the swapped text matches the
 * segment concatenation (i.e. we're rendering the source language), every
 * styled run is preserved verbatim. When it differs (translation), we fall
 * back to a single run carrying the first segment's style — full per-run
 * styling preservation across translation is a known follow-up.
 *
 * `<br>` tags and Temml-rendered `<math>…</math>` blocks inside the swapped
 * text are passed through unescaped (line breaks survive and math renders);
 * everything else is HTML-escaped. The catalog bakes math into these entries
 * via `convertLatexString`, so without the `<math>` pass-through the tags
 * would surface as literal text in fixed-layout pages.
 */
export function rebuildSegmentedInnerHtml(
  segmentsAttr: string | null,
  translatedHtml: string,
): string {
  const segments = parseSegments(segmentsAttr)
  if (!segments || segments.length === 0) return translatedHtml

  const normalize = (s: string): string =>
    s.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim()
  const sourceConcat = segments.map((s) => s.text).join("")
  const runs: Segment[] =
    normalize(sourceConcat) === normalize(translatedHtml)
      ? segments
      : [{ text: translatedHtml, style: segments[0].style }]

  return runs
    .map((seg) => {
      const html = seg.text
        .split(/(<br\s*\/?>|<math[\s\S]*?<\/math>)/i)
        .map((part) =>
          /^<br\s*\/?>$/i.test(part) || /^<math[\s\S]*?<\/math>$/i.test(part)
            ? part
            : escapeHtml(part),
        )
        .join("")
      const styleStr = styleToInline(seg.style)
      return styleStr ? `<span style="${styleStr}">${html}</span>` : html
    })
    .join("")
}
