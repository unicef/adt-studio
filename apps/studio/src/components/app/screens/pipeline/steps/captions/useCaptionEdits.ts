import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type PageDetail } from "@/api/client"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import type {
  CaptionEdit,
  CaptionEntry,
  CaptioningData,
} from "@/components/pipeline/stages/captions/lib/types"

export interface CaptionEdits {
  captions: CaptionEntry[]
  dirty: boolean
  saving: boolean
  saveError: string | null
  editing: CaptionEdit | null
  saveCaptions: () => void
  applyCaption: (imageId: string, newCaption: string) => void
  toggleDecorative: (imageId: string) => void
  startEdit: (cap: CaptionEntry) => void
  changeDraft: (value: string) => void
  commitEdit: () => void
  cancelEdit: () => void
  discard: () => void
}

/**
 * Caption edit state for one page. Two write paths, ported from the classic
 * captions gallery: `pending` stages lightbox edits behind the floating save
 * bar, while card-level edits auto-save through an `optimistic` overlay that
 * holds the new value until the refetch lands (no flicker).
 */
export function useCaptionEdits(label: string, pageId: string, page: PageDetail): CaptionEdits {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const [pending, setPending] = useState<CaptioningData | null>(null)
  const [optimistic, setOptimistic] = useState<CaptioningData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CaptionEdit | null>(null)

  // A version bump means a save or restore landed; a pageId change means
  // navigation. Both reset local edit state — during render, so `dirty` is
  // already false on the first render after the change.
  const resetKey = `${pageId}:${page.versions.imageCaptioning ?? "none"}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey)
    setPending(null)
    setOptimistic(null)
    setEditing(null)
    setSaveError(null)
  }

  const serverData = page.imageCaptioning
  const effective = pending ?? optimistic ?? serverData
  const captions = effective?.captions ?? []
  const dirty = pending != null

  const refreshAfterSave = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
    await queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
    invalidateStoryboardDependents(queryClient, label)
  }, [queryClient, label, pageId])

  const saveCaptions = useCallback(() => {
    if (!pending || saving) return
    setSaving(true)
    setSaveError(null)
    const minDelay = new Promise((resolve) => setTimeout(resolve, 400))
    void (async () => {
      try {
        await api.updateImageCaptioning(label, pageId, pending)
        await refreshAfterSave()
        setEditing(null)
      } catch (err) {
        // Keep the pending edits so a failed save never discards work.
        setSaveError(err instanceof Error ? err.message : t`Save failed`)
      } finally {
        await minDelay
        setSaving(false)
      }
    })()
  }, [pending, saving, label, pageId, refreshAfterSave, t])

  // Stage a lightbox edit behind the explicit save bar.
  const applyCaption = useCallback(
    (imageId: string, newCaption: string) => {
      const base = pending ?? serverData
      if (!base) return
      setPending({
        ...base,
        captions: base.captions.map((c) =>
          c.imageId === imageId ? { ...c, caption: newCaption, source: "manual" as const } : c,
        ),
      })
    },
    [pending, serverData],
  )

  // Persist a single field change immediately (no save bar): show it via the
  // optimistic overlay and hold it until the refetch lands.
  const persistCaption = useCallback(
    (imageId: string, patch: Partial<CaptionEntry>) => {
      const base = optimistic ?? pending ?? serverData
      if (!base) return
      const next: CaptioningData = {
        ...base,
        captions: base.captions.map((c) =>
          c.imageId === imageId ? { ...c, ...patch, source: "manual" as const } : c,
        ),
      }
      setOptimistic(next)
      setSaveError(null)
      void (async () => {
        try {
          await api.updateImageCaptioning(label, pageId, next)
          await refreshAfterSave()
        } catch (err) {
          setOptimistic(null)
          setSaveError(err instanceof Error ? err.message : t`Save failed`)
        }
      })()
    },
    [optimistic, pending, serverData, label, pageId, refreshAfterSave, t],
  )

  const toggleDecorative = useCallback(
    (imageId: string) => {
      const current = (optimistic ?? pending ?? serverData)?.captions.find(
        (c) => c.imageId === imageId,
      )
      if (!current) return
      persistCaption(imageId, { decorative: !current.decorative })
    },
    [optimistic, pending, serverData, persistCaption],
  )

  const commitCaptionEdit = useCallback(
    (imageId: string, draft: string) => {
      const current = (optimistic ?? pending ?? serverData)?.captions.find(
        (c) => c.imageId === imageId,
      )
      if (!current || current.caption === draft) return
      persistCaption(imageId, { caption: draft })
    },
    [optimistic, pending, serverData, persistCaption],
  )

  // Latest-editing ref so startEdit/commitEdit keep a stable identity across
  // keystrokes — otherwise every draft change would re-render all caption
  // cards through their (memoized) callbacks.
  const editingRef = useRef<CaptionEdit | null>(null)
  useEffect(() => {
    editingRef.current = editing
  }, [editing])

  const startEdit = useCallback(
    (cap: CaptionEntry) => {
      const prev = editingRef.current
      if (prev && prev.imageId !== cap.imageId) {
        commitCaptionEdit(prev.imageId, prev.draft)
      }
      setEditing({ imageId: cap.imageId, draft: cap.caption })
    },
    [commitCaptionEdit],
  )

  const changeDraft = useCallback((value: string) => {
    setEditing((prev) => (prev ? { ...prev, draft: value } : prev))
  }, [])

  const commitEdit = useCallback(() => {
    const prev = editingRef.current
    if (!prev) return
    commitCaptionEdit(prev.imageId, prev.draft)
    setEditing(null)
  }, [commitCaptionEdit])

  const cancelEdit = useCallback(() => setEditing(null), [])

  const discard = useCallback(() => {
    setPending(null)
    setSaveError(null)
  }, [])

  return {
    captions,
    dirty,
    saving,
    saveError,
    editing,
    saveCaptions,
    applyCaption,
    toggleDecorative,
    startEdit,
    changeDraft,
    commitEdit,
    cancelEdit,
    discard,
  }
}
