import { z } from "zod"

export const TextCatalogEntry = z.object({
  id: z.string(),
  text: z.string(),
})
export type TextCatalogEntry = z.infer<typeof TextCatalogEntry>

export const TextCatalogOutput = z.object({
  entries: z.array(TextCatalogEntry),
  generatedAt: z.string(),
})
export type TextCatalogOutput = z.infer<typeof TextCatalogOutput>

/**
 * Categories of text catalog entries, inferred from entry id patterns.
 * Catalog entries carry no explicit type field, so the id conventions used
 * by the producing steps are the single source of truth:
 * - captions:  image ids contain `_im{NNN}` (image-captioning)
 * - answers:   activity answer ids contain `_ans_` (page sectioning)
 * - glossary:  `gl{NNN}` / `gl_manual_*` (glossary generation)
 * - easy-read: `{sourceId}_easy_read` (easy-read flattening)
 * - text:      everything else (page text, quiz content, TOC)
 */
export const TextCatalogCategory = z.enum([
  "text",
  "captions",
  "answers",
  "glossary",
  "easy-read",
])
export type TextCatalogCategory = z.infer<typeof TextCatalogCategory>

const IMAGE_ID_RE = /_im\d{3}/
const ANSWER_ID_RE = /_ans_/
const GLOSSARY_ID_RE = /^gl(?:\d{3}|_manual_)/
const EASY_READ_ID_RE = /_easy_read$/

export function getTextCatalogCategory(id: string): TextCatalogCategory {
  // Easy Read ids are `{sourceId}_easy_read`; check first so they are not
  // mistaken for their source entry's category.
  if (EASY_READ_ID_RE.test(id)) return "easy-read"
  if (IMAGE_ID_RE.test(id)) return "captions"
  if (ANSWER_ID_RE.test(id)) return "answers"
  if (GLOSSARY_ID_RE.test(id)) return "glossary"
  return "text"
}
