import { z } from "zod"
import { GOOGLE_FONTS } from "./google-fonts.js"

export const BookFontSource = z.enum(["upload", "google"])
export type BookFontSource = z.infer<typeof BookFontSource>

export const BookFontRole = z.enum([
  "heading",
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

export function isCuratedGoogleFamily(family: string): boolean {
  return GOOGLE_FONTS.some((f) => f.family === family)
}
