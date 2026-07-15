/**
 * Classifies a text-catalog entry by its id pattern. Catalog entries cover
 * regular text, image captions, quiz answers, and glossary terms — each
 * stage's UI surfaces these as separate sub-categories.
 *
 * Classification is shared with the pipeline via `getTextCatalogCategory`
 * in @adt/types so read-aloud exclusions resolve identically in the UI and
 * during TTS generation/packaging.
 */
import {
  getTextCatalogCategory,
  isTtsExcluded,
  type TextCatalogCategory,
  type TtsExclusionConfig,
} from "@adt/types"

const IMAGE_ID_RE = /_im\d{3}/
const ANSWER_ID_RE = /_ans_/
const GLOSSARY_ID_RE = /^gl(?:\d{3}|_manual_)/
const EASY_READ_ID_RE = /_easy_read$/

export type CatalogCategory = "all" | TextCatalogCategory

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
  return getTextCatalogCategory(id)
}

/** Read-aloud exclusion state of an entry, split by cause so the UI can
 * distinguish an individually muted entry (toggleable per row) from one
 * muted by its content type in the speech settings. */
export interface EntryTtsExclusion {
  excluded: boolean
  /** Muted via speech settings' content-type switches */
  byCategory: boolean
  /** Muted individually (its own id, or its source entry for easy-read variants) */
  byId: boolean
}

export function getEntryTtsExclusion(
  id: string,
  config: TtsExclusionConfig | null | undefined,
): EntryTtsExclusion {
  const byId = isTtsExcluded(id, {
    excluded_text_ids: config?.excluded_text_ids,
  })
  const byCategory =
    !byId &&
    isTtsExcluded(id, { excluded_categories: config?.excluded_categories })
  return { excluded: byId || byCategory, byCategory, byId }
}
