import { useCallback, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { TtsExclusionConfig } from "@adt/types"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { getEntryTtsExclusion } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import type { EntryTtsExclusion } from "@/components/pipeline/stages/languages/lib/catalog-entries"

/**
 * Read-aloud exclusions for one book: the category switches from the speech
 * settings plus the individually muted entry ids.
 *
 * Toggling writes the whole book config, so writes are serialized through a
 * promise queue — rapid clicks would otherwise race and the last write in
 * flight could resurrect an earlier list. The pending list is mirrored in state
 * so the toggle flips immediately rather than after the round trip.
 */
export function useTtsExclusions(label: string) {
  const queryClient = useQueryClient()
  const { data: bookConfigData } = useBookConfig(label)
  const { data: activeConfigData } = useActiveConfig(label)
  const updateConfig = useUpdateBookConfig()

  const speechConfig = (activeConfigData?.merged as Record<string, unknown> | undefined)
    ?.speech as Record<string, unknown> | undefined

  const configExcludedIds = useMemo(
    () =>
      Array.isArray(speechConfig?.excluded_text_ids)
        ? (speechConfig.excluded_text_ids as string[])
        : [],
    [speechConfig],
  )

  const [pendingIds, setPendingIds] = useState<string[] | null>(null)
  const pendingIdsRef = useRef<string[] | null>(null)
  // Lazily seeded: a `useRef(Promise.resolve())` would mint a promise on every
  // render only to discard it.
  const queueRef = useRef<Promise<unknown> | null>(null)

  const effectiveIds = pendingIds ?? configExcludedIds

  const exclusionConfig: TtsExclusionConfig = useMemo(
    () => ({
      excluded_categories: Array.isArray(speechConfig?.excluded_categories)
        ? (speechConfig.excluded_categories as TtsExclusionConfig["excluded_categories"])
        : undefined,
      excluded_text_ids: effectiveIds,
    }),
    [effectiveIds, speechConfig],
  )

  const excludedIdSet = useMemo(() => new Set(effectiveIds), [effectiveIds])

  const toggle = useCallback(
    (textId: string) => {
      const currentConfig = { ...(bookConfigData?.config ?? {}) } as Record<string, unknown>
      const existingSpeech =
        currentConfig.speech && typeof currentConfig.speech === "object"
          ? { ...(currentConfig.speech as Record<string, unknown>) }
          : {}

      const next = new Set(pendingIdsRef.current ?? effectiveIds)
      if (next.has(textId)) next.delete(textId)
      else next.add(textId)

      const nextIds = [...next]
      pendingIdsRef.current = nextIds
      setPendingIds(nextIds)
      // An empty array is deliberate: it overrides any project-level list.
      currentConfig.speech = { ...existingSpeech, excluded_text_ids: nextIds }

      queueRef.current = (queueRef.current ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          const updated = await updateConfig.mutateAsync({ label, config: currentConfig })
          await queryClient.invalidateQueries({ queryKey: ["debug", "config", label] })
          return updated
        })
        .finally(() => {
          if (pendingIdsRef.current === nextIds) {
            pendingIdsRef.current = null
            setPendingIds(null)
          }
        })
      void queueRef.current.catch(() => undefined)
    },
    [bookConfigData?.config, effectiveIds, label, queryClient, updateConfig],
  )

  // `getEntryTtsExclusion` builds a fresh object per call, so handing its result
  // straight to a memoized row would break the memo on every render. Results are
  // cached per id and the cache is thrown away only when the config changes.
  const exclusionFor = useMemo(() => {
    const cache = new Map<string, EntryTtsExclusion>()
    return (textId: string) => {
      let hit = cache.get(textId)
      if (!hit) {
        hit = getEntryTtsExclusion(textId, exclusionConfig)
        cache.set(textId, hit)
      }
      return hit
    }
  }, [exclusionConfig])

  return { exclusionFor, excludedIdSet, toggle }
}
