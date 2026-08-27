import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { COMMENT_STRINGS, type CommentStringKey } from "@/features/comments/lib/strings"

export type CommentsTranslate = (
  key: CommentStringKey,
  variables?: Record<string, string>,
) => string

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\$\{(.*?)\}/g, (_, name: string) => variables[name] ?? "")
}

/**
 * `t()` for the comments feature. Same catalog as the rest of the chrome, with
 * the English source text from `COMMENT_STRINGS` as the fallback so an
 * untranslated locale never renders a raw key.
 */
export function useCommentsText(): { t: CommentsTranslate } {
  const dict = useAtomValue(translationsAtom)
  const t = useCallback<CommentsTranslate>(
    (key, variables = {}) => interpolate(dict[key] || COMMENT_STRINGS[key], variables),
    [dict],
  )
  return { t }
}
