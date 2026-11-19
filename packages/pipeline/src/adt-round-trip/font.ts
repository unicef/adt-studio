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
 * <head>. It is the only place an export records the book font: fonts.css
 * always declares the Merriweather default.
 */
export function reflowableBodyFontStyle(fontFamilyChain: string): string {
  return `\n    <style>\n      ${REFLOWABLE_BODY_FONT_SELECTOR} { font-family: ${fontFamilyChain}; }\n    </style>`
}

const BODY_FONT_RULE = new RegExp(
  `${REFLOWABLE_BODY_FONT_SELECTOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{\\s*font-family:\\s*([^;}]+)`,
)

/**
 * The approved reflowable font an exported bundle was written with, read back
 * from the base-font override in its pages (#1158). The font most pages
 * declare wins. Null when no page declares one (the Merriweather default) or
 * the family is not an approved reflowable font, so the book stays `auto`.
 */
export function detectBundleReflowableFont(
  pageHtml: readonly string[],
): ReflowableFontSetting | null {
  const votes = new Map<string, number>()
  for (const html of pageHtml) {
    const chain = BODY_FONT_RULE.exec(html)?.[1]
    if (!chain) continue
    const family = primaryFontFamily(chain.trim()).toLowerCase()
    const font = REFLOWABLE_FONTS.find((candidate) => candidate.family.toLowerCase() === family)
    if (font) votes.set(font.id, (votes.get(font.id) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [id, count] of votes) {
    if (best === null || count > (votes.get(best) ?? 0)) best = id
  }
  return best as ReflowableFontSetting | null
}
