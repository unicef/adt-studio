/**
 * Classifies a text-catalog entry by its id pattern. Catalog entries cover
 * regular text, image captions, quiz answers, and glossary terms — each
 * stage's UI surfaces these as separate sub-categories.
 */

const IMAGE_ID_RE = /_im\d{3}/
const ANSWER_ID_RE = /_ans_/
const GLOSSARY_ID_RE = /^gl(?:\d{3}|_manual_)/
const EASY_READ_ID_RE = /_easy_read$/

export type CatalogCategory =
  | "all"
  | "text"
  | "captions"
  | "answers"
  | "glossary"
  | "easy-read"

export function isImageEntry(id: string): boolean {
  return IMAGE_ID_RE.test(id)
}

export function isAnswerEntry(id: string): boolean {
  return ANSWER_ID_RE.test(id)
}

export function isGlossaryEntry(id: string): boolean {
  return GLOSSARY_ID_RE.test(id)
}

export function isEasyReadEntry(id: string): boolean {
  return EASY_READ_ID_RE.test(id)
}

export function getEntryCategory(id: string): CatalogCategory {
  // Easy Read ids are `{sourceId}_easy_read`; check first so they are not
  // mistaken for plain text entries.
  if (isEasyReadEntry(id)) return "easy-read"
  if (isImageEntry(id)) return "captions"
  if (isAnswerEntry(id)) return "answers"
  if (isGlossaryEntry(id)) return "glossary"
  return "text"
}
