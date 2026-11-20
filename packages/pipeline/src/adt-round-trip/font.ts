import {
  primaryFontFamily,
  REFLOWABLE_FONTS,
  type ReflowableFontSetting,
} from "@adt/types"

/** The elements assets/fonts.css targets; the page's base-font override
 * re-declares them so it wins. */
const REFLOWABLE_BODY_FONT_SELECTOR =
  "body, p, h1, h2, h3, h4, h5, h6, span, div, button, input, textarea, select"

/**
 * The reflowable base-font override the exporter places last in each page's
 * <head>. It is where a current export records the book font: its fonts.css
 * always declares the Merriweather default.
 */
export function reflowableBodyFontStyle(fontFamilyChain: string): string {
  return `\n    <style>\n      ${REFLOWABLE_BODY_FONT_SELECTOR} { font-family: ${fontFamilyChain}; }\n    </style>`
}

const BODY_FONT_RULE = new RegExp(
  `${REFLOWABLE_BODY_FONT_SELECTOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{\\s*font-family:\\s*([^;}]+)`,
)

/**
 * The approved reflowable font an exported bundle was written with (#1158).
 *
 * Current exports write it as a base-font override in each page's head; the
 * font most pages declare wins. Exports made before custom fonts declared it in
 * `assets/fonts.css` instead, with no page rule, so that file is the fallback.
 * There the template default (Merriweather) says nothing about the book, so it
 * is ignored. Null when nothing names an approved non-default font: the book
 * stays `auto`.
 */
export function detectBundleReflowableFont(
  pageHtml: readonly string[],
  fontsCss?: string | null,
): ReflowableFontSetting | null {
  const votes = new Map<string, number>()
  for (const html of pageHtml) {
    const font = approvedFont(BODY_FONT_RULE.exec(html)?.[1])
    if (font) votes.set(font.id, (votes.get(font.id) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [id, count] of votes) {
    if (best === null || count > (votes.get(best) ?? 0)) best = id
  }
  if (best) return best as ReflowableFontSetting
  const legacy = fontsCss ? approvedFont(BODY_FONT_RULE.exec(fontsCss)?.[1]) : undefined
  return legacy && legacy.role !== "default" ? legacy.id as ReflowableFontSetting : null
}

function approvedFont(chain: string | undefined) {
  if (!chain) return undefined
  const family = primaryFontFamily(chain.trim()).toLowerCase()
  return REFLOWABLE_FONTS.find((candidate) => candidate.family.toLowerCase() === family)
}
