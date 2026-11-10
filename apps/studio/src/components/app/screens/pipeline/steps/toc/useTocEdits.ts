import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type TocEntry, type TocGenerationOutput } from "@/api/client"
import { useDocumentEdits } from "../shared/useDocumentEdits"
import { clampLevel, entryKey, getEntries, sameEntry, setEntries } from "./tocRows"

export function useTocEdits(label: string, doc: TocGenerationOutput | null | undefined, locked: boolean, accent?: string) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const save = useCallback((next: TocGenerationOutput) => api.updateToc(label, next), [label])
  const afterSave = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "toc"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "text-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] }),
      ]),
    [label, queryClient],
  )
  const noun = useMemo(() => ({ one: t`entry`, other: t`entries` }), [t])

  const edits = useDocumentEdits<TocGenerationOutput, TocEntry>({
    id: "toc",
    stage: "toc",
    doc,
    versionKey: String(doc?.version ?? "none"),
    getItems: getEntries,
    setItems: setEntries,
    keyOf: entryKey,
    isEqual: sameEntry,
    noun,
    save,
    afterSave,
    locked,
    lockedReason: t`Wait for the table of contents to finish generating.`,
    accent,
  })

  const { update, insert } = edits
  const shift = useCallback((id: string, delta: number) => update(id, (entry) => ({ ...entry, level: clampLevel(entry.level + delta) })), [update])
  const addAfter = useCallback(
    (afterId: string | null, level: number) => {
      const id = `toc_new_${Date.now()}`
      insert({ id, title: t`New entry`, sectionId: "", href: "", chapterId: "", level }, afterId)
      return id
    },
    [insert, t],
  )
  return { ...edits, shift, addAfter }
}

export type TocEdits = ReturnType<typeof useTocEdits>
