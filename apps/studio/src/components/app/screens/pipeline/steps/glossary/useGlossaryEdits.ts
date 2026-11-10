import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type GlossaryItem, type GlossaryOutput } from "@/api/client"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { useDocumentEdits } from "../shared/useDocumentEdits"
import { classifyTerm, fromRows, rowKey, sameTerm, toRows, withTextEdit, type GlossaryRow, type GlossaryTextPatch } from "./glossaryRows"

export function useGlossaryEdits(label: string, doc: GlossaryOutput | null | undefined, locked: boolean, accent?: string) {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const save = useCallback(
    async (next: GlossaryOutput) => {
      const result = await api.updateGlossary(label, next)
      if (result.imageRequirementsChanged) {
        void queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
        invalidateStoryboardDependents(queryClient, label)
      }
    },
    [label, queryClient],
  )

  const afterSave = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "glossary"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "text-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] }),
      ]),
    [label, queryClient],
  )

  const noun = useMemo(() => ({ one: t`term`, other: t`terms` }), [t])

  const edits = useDocumentEdits<GlossaryOutput, GlossaryRow>({
    id: "glossary",
    stage: "glossary",
    doc,
    versionKey: String(doc?.version ?? "none"),
    getItems: toRows,
    setItems: fromRows,
    keyOf: rowKey,
    isEqual: sameTerm,
    classifyChanged: classifyTerm,
    noun,
    save,
    afterSave,
    locked,
    lockedReason: t`Wait for the glossary to finish generating.`,
    accent,
  })

  const { update, insert, remove } = edits
  const editText = useCallback((key: string, patch: GlossaryTextPatch) => update(key, (row) => withTextEdit(row, patch)), [update])
  const setPicture = useCallback((key: string, imageId: string | undefined) => update(key, { imageId }), [update])
  const setPruned = useCallback((key: string, pruned: boolean) => update(key, { pruned }), [update])
  const addTerm = useCallback(
    (item: GlossaryItem) => {
      const key = item.id ?? `new-${Date.now()}`
      insert({ ...item, source: "manual", _key: key }, null)
      return key
    },
    [insert],
  )

  return { ...edits, editText, setPicture, setPruned, addTerm, removeTerm: remove }
}

export type GlossaryEdits = ReturnType<typeof useGlossaryEdits>
