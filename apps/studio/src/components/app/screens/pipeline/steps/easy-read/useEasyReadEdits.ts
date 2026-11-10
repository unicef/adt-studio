import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type EasyReadEntry, type EasyReadSectionBlock } from "@/api/client"
import { useEasyRead } from "../shared/queries"
import { useDocumentEdits } from "../shared/useDocumentEdits"

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
  editedKeys: ReadonlySet<string>
  isEntryEdited: (blockKey: EasyReadBlockKey, entry: EasyReadEntry) => boolean
  updateEntry: (blockKey: EasyReadBlockKey, easyReadId: string, text: string) => void
  save: () => Promise<void>
  discard: () => void
}

type EasyReadDoc = NonNullable<ReturnType<typeof useEasyRead>["data"]>

export function easyReadBlockKey(block: EasyReadBlockKey): string {
  return `${block.pageId}:${block.sectionId}:${block.sectionIndex}`
}

const entryKey = (block: EasyReadBlockKey, easyReadId: string) => `${easyReadBlockKey(block)}:${easyReadId}`

const getBlocks = (doc: EasyReadDoc) => doc.blocks
const setBlocks = (doc: EasyReadDoc, blocks: EasyReadSectionBlock[]) => ({ ...doc, blocks })

export function useEasyReadEdits(label: string, options: { locked?: boolean; accent?: string } = {}): EasyReadEdits {
  const { t } = useLingui()
  const query = useEasyRead(label)
  const queryClient = useQueryClient()

  const save = useCallback(
    (next: EasyReadDoc) =>
      api.updateEasyRead(label, {
        blocks: next.blocks,
        generatedAt: next.generatedAt ?? new Date().toISOString(),
      }),
    [label],
  )

  const afterSave = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "easy-read"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "text-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] }),
        queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", label] }),
        queryClient.invalidateQueries({
          queryKey: ["debug", "versions", label, "accessibility-assessment", "book"],
        }),
      ]),
    [queryClient, label],
  )

  const noun = useMemo(() => ({ one: t`section`, other: t`sections` }), [t])

  const edits = useDocumentEdits({
    id: "easy-read",
    stage: "easy-read",
    doc: query.data,
    versionKey: String(query.data?.version ?? "none"),
    getItems: getBlocks,
    setItems: setBlocks,
    keyOf: easyReadBlockKey,
    noun,
    save,
    afterSave,
    locked: options.locked,
    lockedReason: t`Editing is paused until Easy Read finishes.`,
    accent: options.accent,
  })

  const savedText = useMemo(() => {
    const map = new Map<string, string>()
    for (const block of query.data?.blocks ?? []) {
      for (const entry of block.entries) map.set(entryKey(block, entry.easyReadId), entry.text.trim())
    }
    return map
  }, [query.data])

  const { update, editedKeys } = edits
  const isEntryEdited = useCallback(
    (block: EasyReadBlockKey, entry: EasyReadEntry) =>
      editedKeys.has(easyReadBlockKey(block)) && savedText.get(entryKey(block, entry.easyReadId)) !== entry.text.trim(),
    [editedKeys, savedText],
  )
  const updateEntry = useCallback(
    (blockKey: EasyReadBlockKey, easyReadId: string, text: string) =>
      update(easyReadBlockKey(blockKey), (block) => ({
        ...block,
        entries: block.entries.map((entry) => (entry.easyReadId === easyReadId ? { ...entry, text } : entry)),
      })),
    [update],
  )

  return {
    blocks: edits.items,
    isLoading: query.isLoading,
    version: query.data?.version ?? null,
    dirty: edits.dirty,
    saving: edits.saving,
    saveError: edits.saveError,
    editedKeys,
    isEntryEdited,
    updateEntry,
    save: edits.save,
    discard: edits.discard,
  }
}
