/**
 * Google Fonts registry + close-match resolution.
 *
 * PDFs name their fonts by PostScript name (e.g. `MouseMemoirs`,
 * `ABCDEF+MouseMemoirs-Regular`, `TimesNewRomanPSMT`). We resolve that name to
 * a Google Fonts family so the renderer can (a) emit the *Google* family name
 * as the CSS `font-family` (matching the `@font-face` we load) and (b) load it
 * from Google Fonts (online via `<link>`, offline via inlined woff2).
 *
 * Resolution is three tiers, best-first:
 *   1. Exact — the font itself is on Google Fonts (e.g. Mouse Memoirs).
 *   2. Alias — a well-known proprietary/system font with a known Google
 *      equivalent, metric-compatible where one exists (Arial→Arimo,
 *      Times New Roman→Tinos, Calibri→Carlito, Cambria→Caladea,
 *      Georgia→Gelasio, Courier→Cousine, Comic Sans→Comic Neue).
 *   3. Category — a conservative heuristic on the name for the long tail:
 *      sans / monospace / handwriting fonts get a sensible Google stand-in.
 *      Serif and unrecognized fonts return null and keep the bundled
 *      Merriweather fallback (already a reasonable generic serif).
 *
 * Pure constant data + string helpers, shared by extraction (`@adt/pdf`
 * `cssFontFamily`, which emits the family) and packaging/preview
 * (`@adt/pipeline`, which loads it). Tune the tables below to taste.
 */

export interface GoogleFontEntry {
  /** Normalized lookup key (lowercase, alphanumerics only). */
  key: string
  /** Google Fonts family display name, used verbatim as the CSS family
   *  name AND (space→`+`) in the css2 request URL. */
  family: string
}

/**
 * Families we know how to LOAD from Google Fonts. Every alias / category
 * target below must resolve to one of these. Only genuine Google Fonts
 * families belong here.
 */
export const GOOGLE_FONTS: readonly GoogleFontEntry[] = [
  // Source fonts that are themselves on Google Fonts.
  { key: "mousememoirs", family: "Mouse Memoirs" },
  // Metric-compatible / close stand-ins used as alias + category targets.
  { key: "arimo", family: "Arimo" }, // Arial / Helvetica (metric-compatible)
  { key: "tinos", family: "Tinos" }, // Times New Roman (metric-compatible)
  { key: "cousine", family: "Cousine" }, // Courier New (metric-compatible)
  { key: "carlito", family: "Carlito" }, // Calibri (metric-compatible)
  { key: "caladea", family: "Caladea" }, // Cambria (metric-compatible)
  { key: "gelasio", family: "Gelasio" }, // Georgia (metric-compatible)
  { key: "comicneue", family: "Comic Neue" }, // Comic Sans
  { key: "caveat", family: "Caveat" }, // generic handwriting / script
  // Approved reflowable body fonts (see reflowable-fonts.ts). Merriweather is
  // bundled locally, not loaded from Google, so it is intentionally absent.
  { key: "atkinsonhyperlegible", family: "Atkinson Hyperlegible" },
  { key: "lexend", family: "Lexend" },
  { key: "lora", family: "Lora" },
  { key: "opensans", family: "Open Sans" },
  { key: "roboto", family: "Roboto" },
  { key: "inter", family: "Inter" },
  { key: "notosans", family: "Noto Sans" },
  { key: "notoserif", family: "Noto Serif" },
  { key: "ptsans", family: "PT Sans" },
  { key: "ptserif", family: "PT Serif" },
  { key: "patrickhand", family: "Patrick Hand" },
  { key: "edunswactfoundation", family: "Edu NSW ACT Foundation" },
  { key: "notosansmono", family: "Noto Sans Mono" },
]

/** Look up a loadable entry by its Google family display name. */
function entryByFamily(family: string): GoogleFontEntry | null {
  return GOOGLE_FONTS.find((f) => f.family === family) ?? null
}

/**
 * Tier 2 — curated aliases, matched as prefixes against the normalized key so
 * trailing foundry/style junk is tolerated (e.g. `timesnewromanpsmt` still
 * matches `timesnewroman`). Order matters: more specific prefixes first.
 */
const ALIAS_PREFIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^timesnewroman/, "Tinos"],
  [/^times/, "Tinos"],
  [/^(arial|helvetica|liberationsans|nimbussans)/, "Arimo"],
  [/^(couriernew|courier|liberationmono|nimbusmono)/, "Cousine"],
  [/^georgia/, "Gelasio"],
  [/^calibri/, "Carlito"],
  [/^cambria/, "Caladea"],
  [/^comicsans/, "Comic Neue"],
  [/^(verdana|tahoma|segoeui|trebuchet)/, "Arimo"],
]

/**
 * Tier 3 — conservative category heuristic for fonts not matched above. Only
 * redirects clearly sans / monospace / handwriting designs (where the generic
 * serif Merriweather fallback would look wrong); serif and unknown fonts
 * return null and keep that fallback. Runs on the cleaned name token (no
 * spaces, e.g. "FuturaBT") so CamelCase tokens still match.
 */
function closeGoogleByCategory(token: string): string | null {
  if (/(mono|courier|consol|menlo|typewriter)/i.test(token)) return "Cousine"
  if (/(script|handwrit|hand|brush|marker|chalk|cursive|signature|comic)/i.test(token))
    return "Caveat"
  if (
    /(sans|grotesk|gothic|arial|helvet|verdana|tahoma|segoe|calibri|frutiger|franklin|futura|gill|ubuntu|lato|montserrat|roboto|noto|avenir|proxima)/i.test(
      token,
    )
  )
    return "Arimo"
  return null
}

/** Normalize a font name to a lookup key: drop everything but letters and
 *  digits, lowercase. So `Mouse Memoirs`, `MouseMemoirs`, `MOUSEMEMOIRS-Regular`
 *  (after suffix stripping) all collapse to `mousememoirs`. */
export function normalizeFontKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Reduce a declared name (or font-family chain) to its bare font token:
 *  first comma item, unquoted, without a PDF subset prefix (`ABCDEF+`) or a
 *  PostScript style suffix (`-Regular`). */
function cleanFontToken(declared: string): string {
  let token = declared.split(",")[0].trim().replace(/^["']|["']$/g, "")
  token = token.replace(/^[A-Z]{6}\+/, "")
  const dash = token.indexOf("-")
  if (dash > 0) token = token.slice(0, dash)
  return token
}

/**
 * Resolve a declared font name (or a CSS font-family chain — only the first
 * token is considered) to a Google Fonts family via the three tiers described
 * at the top of the file, or null when nothing suitable matches.
 */
export function resolveGoogleFont(declared: string): GoogleFontEntry | null {
  if (!declared) return null
  const token = cleanFontToken(declared)
  const key = normalizeFontKey(token)
  if (!key) return null
  // Tier 1 — exact Google font.
  const exact = GOOGLE_FONTS.find((f) => f.key === key)
  if (exact) return exact
  // Tier 2 — curated alias (prefix match tolerates foundry/style suffixes).
  for (const [re, family] of ALIAS_PREFIXES) {
    if (re.test(key)) return entryByFamily(family)
  }
  // Tier 3 — category close-match (sans / mono / handwriting only).
  const category = closeGoogleByCategory(token)
  if (category) return entryByFamily(category)
  return null
}

/**
 * Extract the primary (declared) family from a CSS font-family chain — the
 * first token, with surrounding quotes stripped. e.g. `'Mouse Memoirs',serif`
 * and `"Mouse Memoirs", Merriweather, serif` both → `Mouse Memoirs`. Returns
 * "" for empty input.
 */
export function primaryFontFamily(chain: string): string {
  if (!chain) return ""
  return chain.split(",")[0].trim().replace(/^["']|["']$/g, "")
}

/** Wrap a CSS family name in SINGLE quotes when it contains whitespace.
 *  Single quotes (not double) because these values are serialized into
 *  double-quoted inline `style="..."` attributes — an embedded double quote
 *  would terminate the attribute and drop the whole style. CSS accepts
 *  either quote style for family names. */
export function cssQuoteFamily(family: string): string {
  return /\s/.test(family) ? `'${family}'` : family
}

/**
 * Build a Google Fonts css2 stylesheet URL for the given family display
 * names, or null when the list is empty. Families are de-duplicated and
 * emitted in input order. `display=swap` matches the bundled Merriweather.
 */
export function googleFontsCss2Url(families: string[]): string | null {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const f of families) {
    if (!f || seen.has(f)) continue
    seen.add(f)
    unique.push(f)
  }
  if (unique.length === 0) return null
  const params = unique
    .map((f) => `family=${f.trim().replace(/\s+/g, "+")}`)
    .join("&")
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

/**
 * Scan rendered HTML/CSS and return the Google Fonts family display names
 * referenced in `font-family` declarations (those whose `@font-face` we should
 * load). Matching is scoped to declaration values — not arbitrary body text —
 * so short family names (e.g. "Inter") don't false-match prose like
 * "Internet". HTML-escaped JSON in `data-segments` (`font-family&quot;:`) is
 * skipped because the `:` must follow `font-family` directly.
 */
export function googleFontsReferencedIn(text: string): string[] {
  if (!text) return []
  const found = new Set<string>()
  // Decode `&apos;` first: fixed-layout spans emit `font-family:&apos;Noto
  // Sans&apos;`, and the `;` inside the entity would cut the value capture short.
  // (data-segments JSON stays skipped: decoding leaves `font-family":`, which the
  // `font-family\s*:` anchor never matches.)
  const decoded = text
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
  // Scan font-family declaration values only (inline styles + CSS rules), then
  // exact-match each comma-separated family token. Exact (not substring)
  // matching avoids body-text false positives AND prefix collisions — e.g. a
  // page using "Noto Sans Mono" must not also pull "Noto Sans".
  for (const m of decoded.matchAll(/font-family\s*:\s*([^;"}<]+)/gi)) {
    for (const tokenRaw of m[1].split(",")) {
      const token = tokenRaw.trim().replace(/^['"]+|['"]+$/g, "")
      const entry = GOOGLE_FONTS.find((f) => f.family === token)
      if (entry) found.add(entry.family)
    }
  }
  return [...found]
}
