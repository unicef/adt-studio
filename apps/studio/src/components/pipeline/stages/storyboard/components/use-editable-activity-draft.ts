import { useRef, type Dispatch, type SetStateAction } from "react"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import type { EditableActivity } from "@adt/types"
import { api } from "@/api/client"
import { useGuardedDraft } from "@/hooks/use-guarded-draft"
import { useSaveEditableActivities } from "@/hooks/use-editable-activities"
import { rebaseDraft } from "@/lib/rebase-draft"

/** Keep the whole-page entity and its captured version together through reset,
 * query refresh, delayed feedback and asynchronous Save acknowledgements. */
export function useEditableActivityDraft(props: {
  bookLabel: string; pageId: string; sectionIndex: number; version: number;
  activity?: EditableActivity; activities: Record<string, EditableActivity>;
}) {
  const { t } = useLingui()
  const { bookLabel, pageId, sectionIndex, activities, version } = props
  const guarded = useGuardedDraft(activities, version, async () => {
    const latest = await api.getEditableActivities(bookLabel, pageId)
    return { value: latest.activities, version: latest.version }
  })
  const savePromiseRef = useRef<Promise<void> | null>(null)
  const submittedRef = useRef<Record<string, EditableActivity> | null>(null)
  const save = useSaveEditableActivities(bookLabel, pageId)
  const key = String(sectionIndex)
  const draft = guarded.pending?.[key] ?? props.activity
  const setDraft: Dispatch<SetStateAction<EditableActivity>> = (action) => {
    guarded.setPending(previous => {
      const entity = previous ?? activities
      const current = entity[key] ?? props.activity!
      const next = { ...entity, [key]: typeof action === "function" ? action(current) : action }
      return submittedRef.current === null && version === guarded.baseVersion && JSON.stringify(next) === JSON.stringify(guarded.baseValue) ? null : next
    })
  }
  const saveDraft = (): Promise<void> => {
    if (savePromiseRef.current) return savePromiseRef.current
    const promise = (async () => {
      const pending = guarded.getPending()
      const target = pending?.[key]
      if (!pending || !target) return
      // Canonicalize only the submitted snapshot. A successor draft is rebased
      // onto this acknowledged value without borrowing a background query version.
      const cleaned = target.kind === "fill-in-the-blank"
        ? { ...target, steps: target.steps.map(step => ({ ...step, sentences: step.sentences.filter(sentence => sentence.text.trim() !== "") })) }
        : target
      const submitted = { ...pending, [key]: cleaned }
      submittedRef.current = submitted
      try {
        const result = await save.mutateAsync({ activities: submitted, baseVersion: guarded.getBaseVersion() })
        const successor = guarded.getPending()
        if (successor === pending) guarded.setPending(null)
        else if (successor) guarded.setPending(rebaseDraft(pending, successor, submitted).value)
        guarded.acknowledge(submitted, result.version)
        toast.success(t`Activity saved`)
      } catch (error) {
        // Keep the old draft/version after conflict; never silently apply it to a
        // regenerated tree or replace a neighboring activity edited meanwhile.
        toast.error(error instanceof Error ? error.message : t`Save failed`)
        throw error
      } finally {
        if (submittedRef.current === submitted) submittedRef.current = null
      }
    })()
    savePromiseRef.current = promise
    const clear = () => { if (savePromiseRef.current === promise) savePromiseRef.current = null }
    void promise.then(clear, clear)
    return promise
  }
  const saveBeforeLeave = async () => {
    await saveDraft()
    if (guarded.getPending()) throw new Error(t`Newer edits are still unsaved. Save them before leaving.`)
  }
  const beginFeedback = () => {
    const existing = guarded.getPending()
    const captured = existing ?? structuredClone(activities)
    const requestedActivity = JSON.stringify(captured[key])
    if (!existing) guarded.setPending(captured)
    return {
      accepts: () => JSON.stringify(guarded.getPending()?.[key]) === requestedActivity,
      failed: () => { if (!existing && guarded.getPending() === captured) guarded.setPending(null) },
    }
  }
  // A replacement confirms this exact draft, not whatever the editor contains
  // when the response arrives. Later edits and save acknowledgements survive.
  const captureDiscard = () => {
    const pending = guarded.getPending(), submitted = submittedRef.current
    return () => {
      if (guarded.getPending() !== pending || submittedRef.current !== submitted) return false
      guarded.setPending(null)
      return true
    }
  }
  const dirty = save.isPending || submittedRef.current !== null || guarded.pending !== null && (version !== guarded.baseVersion || JSON.stringify(guarded.pending) !== JSON.stringify(guarded.baseValue))
  return { draft, setDraft, dirty, saveDraft, saveBeforeLeave, beginFeedback,
    saving: save.isPending, captureDiscard, discardDraft: () => guarded.setPending(null) }
}
