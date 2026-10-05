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
const GLOSSARY_ID_RE = /^gl(?:\d{3}|_manual_)/
const EASY_READ_ID_RE = /_easy_read$/

/** Separates an activity answer's owning sectionId from its answer key. */
export const ANSWER_ID_SEPARATOR = "_ans_"

/** The catalog id for one activity answer. The only place answer ids are built. */
export function answerTextId(sectionId: string, answerKey: string): string {
  return `${sectionId}${ANSWER_ID_SEPARATOR}${answerKey}`
}

/**
 * The sectionId that owns an activity answer text id, or null if the id is not
 * an answer id. The inverse of `answerTextId`.
 *
 * Section ids are immutable and are retired rather than reissued, so every
 * store keyed by an answer id (`text-catalog`, its translations, the `tts`
 * manifest and the audio derived from it) has to be able to ask which section
 * an id belongs to when that section retires. Deriving the owner is O(1) per
 * id; testing every retired id as a prefix would be O(retired x entries).
 *
 * The separator is what makes this collision-free. Canonical sequence numbers
 * are always three digits, but the legacy `${pageId}_s${N}` shape the agent
 * tools once minted is variable-length -- and `pg001_s11_ans_a` still resolves
 * to `pg001_s11`, not `pg001_s1`, because the character after `pg001_s1` is
 * `1` rather than the separator. Suffixed variants only ever append
 * (`--secondary` from `voiceSlotEntryId`, `_easy_read` from easy-read
 * flattening), so they resolve to the same owner, which is what callers want.
 *
 * Deliberately does not validate that the prefix *looks* like a section id:
 * legacy `_sN` ids and spread page ids (`pg001002`) both have to work, and a
 * caller's own set of retired ids is the real validation.
 */
export function sectionIdOfAnswerTextId(textId: string): string | null {
  const index = textId.indexOf(ANSWER_ID_SEPARATOR)
  return index > 0 ? textId.slice(0, index) : null
}

export function getTextCatalogCategory(id: string): TextCatalogCategory {
  // Easy Read ids are `{sourceId}_easy_read`; check first so they are not
  // mistaken for their source entry's category.
  if (EASY_READ_ID_RE.test(id)) return "easy-read"
  if (IMAGE_ID_RE.test(id)) return "captions"
  if (sectionIdOfAnswerTextId(id) !== null) return "answers"
  if (GLOSSARY_ID_RE.test(id)) return "glossary"
  return "text"
}
