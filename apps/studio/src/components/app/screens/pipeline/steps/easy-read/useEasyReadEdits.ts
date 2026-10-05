import { useCallback, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type EasyReadSectionBlock } from "@/api/client"
import { useEasyRead } from "../shared/queries"

export interface EasyReadBlockKey {
  pageId: string
  sectionId: string
  sectionIndex: number
}

export interface EasyReadEdits {
  blocks: EasyReadSectionBlock[]
  isLoading: boolean
  version: number | null
  dirty: boolean
  saving: boolean
  saveError: Error | null
  updateEntry: (blockKey: EasyReadBlockKey, easyReadId: string, text: string) => void
  save: () => void
  discard: () => void
}

const NO_BLOCKS: EasyReadSectionBlock[] = []

export function useEasyReadEdits(label: string): EasyReadEdits {
  const query = useEasyRead(label)
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<EasyReadSectionBlock[] | null>(null)

  // A version bump means a save, restore, or regeneration landed — reset the
  // draft during render so `dirty` is already false on the next render.
  const versionKey = String(query.data?.version ?? "none")
  const [lastVersionKey, setLastVersionKey] = useState(versionKey)
  if (lastVersionKey !== versionKey) {
    setLastVersionKey(versionKey)
    setDraft(null)
  }

  const serverBlocks = query.data?.blocks ?? NO_BLOCKS
  const blocks = draft ?? serverBlocks
  const dirty = draft !== null

  const saveMutation = useMutation({
    mutationFn: (nextBlocks: EasyReadSectionBlock[]) =>
      api.updateEasyRead(label, {
        blocks: nextBlocks,
        generatedAt: query.data?.generatedAt ?? new Date().toISOString(),
      }),
    onSuccess: async () => {
      setDraft(null)
      // Easy Read feeds the text catalog, TTS, packaging, and the
      // accessibility assessment — refresh them all.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "easy-read"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "text-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] }),
        queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", label] }),
        queryClient.invalidateQueries({
          queryKey: ["debug", "versions", label, "accessibility-assessment", "book"],
        }),
      ])
    },
  })

  const updateEntry = useCallback(
    (blockKey: EasyReadBlockKey, easyReadId: string, text: string) => {
      setDraft((prev) => {
        const base = prev ?? serverBlocks
        return base.map((block) => {
          if (
            block.pageId !== blockKey.pageId ||
            block.sectionId !== blockKey.sectionId ||
            block.sectionIndex !== blockKey.sectionIndex
          ) {
            return block
          }
          return {
            ...block,
            entries: block.entries.map((entry) =>
              entry.easyReadId === easyReadId ? { ...entry, text } : entry,
            ),
          }
        })
      })
    },
    [serverBlocks],
  )

  const saveMutate = saveMutation.mutate
  const save = useCallback(() => {
    if (draft) saveMutate(draft)
  }, [draft, saveMutate])

  const discard = useCallback(() => setDraft(null), [])

  return useMemo(
    () => ({
      blocks,
      isLoading: query.isLoading,
      version: query.data?.version ?? null,
      dirty,
      saving: saveMutation.isPending,
      saveError: (saveMutation.error as Error | null) ?? null,
      updateEntry,
      save,
      discard,
    }),
    [
      blocks,
      query.isLoading,
      query.data?.version,
      dirty,
      saveMutation.isPending,
      saveMutation.error,
      updateEntry,
      save,
      discard,
    ],
  )
}
