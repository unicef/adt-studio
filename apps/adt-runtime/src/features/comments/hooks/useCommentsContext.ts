import { useAtomValue } from "jotai"
import { useMemo } from "react"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { embedModeAtom } from "@/shared/state/ui.atoms"
import { createCommentsApi, type CommentsApi } from "@/features/comments/lib/api"
import { currentPublishContext } from "@/features/comments/lib/publish-context"

export interface CommentsRuntimeContext {
  apiBase: string
  api: CommentsApi
}

/**
 * `null` unless this book was both published (`features.comments`) *and* is
 * being read through a `/p/<token>/` share link. Both conditions must hold: the
 * flag alone would make a downloaded copy fetch a comments API that isn't
 * there, and the prefix alone would enable comments on a snapshot published
 * before the feature existed.
 */
export function useCommentsContext(): CommentsRuntimeContext | null {
  const enabled = useAtomValue(appConfigAtom).features.comments === true
  const embed = useAtomValue(embedModeAtom) as boolean

  return useMemo(() => {
    if (!enabled || embed) return null
    const context = currentPublishContext()
    if (!context) return null
    return { apiBase: context.apiBase, api: createCommentsApi(context.apiBase) }
  }, [enabled, embed])
}
