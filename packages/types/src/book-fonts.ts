import { z } from "zod"
import { cssQuoteFamily } from "./google-fonts.js"

export const BookFontSource = z.enum(["upload", "google"])
export type BookFontSource = z.infer<typeof BookFontSource>

export const BookFontRole = z.enum([
  "heading",
  "paragraph",
  "body",
  "caption",
  "decorative",
  "mono",
  "unassigned",
])
export type BookFontRole = z.infer<typeof BookFontRole>

export const BookFontCategory = z.enum(["serif", "sans", "handwriting", "mono", "display"])
export type BookFontCategory = z.infer<typeof BookFontCategory>

export const BOOK_FONT_FORMATS = ["woff2", "woff", "truetype", "opentype"] as const
export const BookFontFormat = z.enum(BOOK_FONT_FORMATS)
export type BookFontFormat = z.infer<typeof BookFontFormat>

export const BookFontLicense = z.object({
  description: z.string().optional(),
  url: z.string().optional(),
  embeddingRestricted: z.boolean().default(false),
  openSource: z.boolean().nullable().default(null),
})
export type BookFontLicense = z.infer<typeof BookFontLicense>

export const BookFontFace = z.object({
  file: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  weight: z.number().int().min(1).max(1000).default(400),
  style: z.enum(["normal", "italic"]).default("normal"),
  format: BookFontFormat,
  unicodeRange: z.string().optional(),
})
export type BookFontFace = z.infer<typeof BookFontFace>

export const BookFont = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  family: z.string().min(1),
  source: BookFontSource,
  googleKey: z.string().optional(),
  category: BookFontCategory.optional(),
  faces: z.array(BookFontFace).default([]),
  role: BookFontRole.default("unassigned"),
  roleLockedByUser: z.boolean().default(false),
  license: BookFontLicense.optional(),
})
export type BookFont = z.infer<typeof BookFont>

export const BookFontRegistry = z.object({
  fonts: z.array(BookFont).default([]),
})
export type BookFontRegistry = z.infer<typeof BookFontRegistry>

export const FONT_REGISTRY_NODE = "font-registry"
export const FONT_REGISTRY_ITEM_ID = "book"

export const FONT_ASSIGNMENT_NODE = "font-assignment"
export const FONT_ASSIGNMENT_ITEM_ID = "book"

export function bookFontIdFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "font"
}

/** The attached font assigned the `body` role, if any — it replaces the
 *  reflowable base font in generated pages. */
export function bookBodyFont(registry: BookFontRegistry): BookFont | null {
  return registry.fonts.find((f) => f.role === "body") ?? null
}

const CATEGORY_GENERIC: Record<BookFontCategory, string> = {
  serif: "serif",
  sans: "sans-serif",
  handwriting: "cursive",
  mono: "monospace",
  display: "sans-serif",
}

/**
 * CSS font-family chain for an attached book font. Mirrors
 * `reflowableFontFamilyChain`: handwriting/mono fall back straight to their
 * category generic; everything else inserts the always-bundled Merriweather
 * as a legible fallback while the webfont loads.
 */
export function bookFontFamilyChain(font: Pick<BookFont, "family" | "category">): string {
  const fam = cssQuoteFamily(font.family)
  const generic = CATEGORY_GENERIC[font.category ?? "sans"]
  return font.category === "handwriting" || font.category === "mono"
    ? `${fam},${generic}`
    : `${fam},'Merriweather',${generic}`
}

export function bookFontsReferencedIn(text: string, registry: BookFontRegistry): BookFont[] {
  if (!text || registry.fonts.length === 0) return []
  const byFamily = new Map(registry.fonts.map((f) => [f.family, f]))
  const found = new Map<string, BookFont>()
  for (const m of text.matchAll(/font-family\s*:\s*([^;"}<]+)/gi)) {
    for (const tokenRaw of m[1].split(",")) {
      const token = tokenRaw.trim().replace(/^['"]+|['"]+$/g, "")
      const font = byFamily.get(token)
      if (font) found.set(font.id, font)
    }
  }
  return [...found.values()]
}

const OPEN_SOURCE_LICENSE_RE =
  /(SIL Open Font|Open Font License|\bOFL\b|Apache|\bMIT\b|GNU|\bGPL\b|\bLGPL\b|Ubuntu Font|Creative Commons|\bCC0\b|\bCC[- ]BY\b|public domain|\bUFL\b|opensource\.org|scripts\.sil\.org)/i

const RESTRICTED_LICENSE_RE =
  /(all rights reserved|proprietary|commercial (license|use only)|for (personal|evaluation) use only|not (be )?redistribut|may not be (copied|distributed|embedded|modified)|unauthorized|без права|uso (pessoal|restrito))/i

export function classifyFontLicenseOpenSource(
  description?: string | null,
  url?: string | null,
): boolean | null {
  const text = `${description ?? ""} ${url ?? ""}`.trim()
  if (!text) return null
  if (OPEN_SOURCE_LICENSE_RE.test(text)) return true
  if (RESTRICTED_LICENSE_RE.test(text)) return false
  return null
}
