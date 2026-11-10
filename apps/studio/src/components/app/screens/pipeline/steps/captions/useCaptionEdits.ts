import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type PageDetail } from "@/api/client"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useVariant } from "@/components/app/lab/variants"
import type { CaptionEntry, CaptioningData } from "@/components/pipeline/stages/captions/lib/types"
import type { DraftStore } from "../shared/pageview/draftStore"
import { useDocumentEdits } from "../shared/useDocumentEdits"
import { sameCaption, stampSources } from "./captionSources"

const captionsOf = (doc: CaptioningData) => doc.captions
const withCaptions = (doc: CaptioningData, captions: CaptionEntry[]): CaptioningData => ({ ...doc, captions: stampSources(captions, doc.captions) })
const imageKey = (entry: CaptionEntry) => entry.imageId
const UNDO_MS = 6000

export type CaptionSaveState = "saving" | "saved"

export function useCaptionEdits(
  label: string,
  pageId: string,
  page: PageDetail | undefined,
  locked: boolean,
  store?: DraftStore<CaptionEntry>,
  accent?: string,
) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const doc = page?.imageCaptioning ?? null

  const save = useCallback((next: CaptioningData) => api.updateImageCaptioning(label, pageId, next), [label, pageId])
  const afterSave = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] }),
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages"], exact: true }),
    ])
    invalidateStoryboardDependents(queryClient, label)
  }, [queryClient, label, pageId])

  const autoSave = useVariant("capsave") === "auto"
  const noun = useMemo(() => ({ one: t`image`, other: t`images` }), [t])
  const scope = useMemo(() => ({ page: pageId }), [pageId])
  const versionKey = `${pageId}:${page?.versions.imageCaptioning ?? "none"}`
  const keepDraft = useMemo(() => (store && page ? store.bind(pageId, versionKey) : undefined), [store, page, pageId, versionKey])

  const edits = useDocumentEdits<CaptioningData, CaptionEntry>({
    id: `captions:${pageId}`,
    stage: "captions",
    doc,
    versionKey,
    getItems: captionsOf,
    setItems: withCaptions,
    keyOf: imageKey,
    isEqual: sameCaption,
    noun,
    save,
    afterSave,
    locked,
    lockedReason: t`Wait for ${getStageLabelI18n("captions")} to finish.`,
    scope,
    keepDraft,
    accent,
    autoSave,
  })

  const { update } = edits
  const [recent, setRecent] = useState<ReadonlyMap<string, CaptionEntry>>(() => new Map())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const itemsRef = useRef(edits.items)
  itemsRef.current = edits.items

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => clearTimeout(timer))
  }, [])

  const forget = useCallback((imageId: string) => {
    clearTimeout(timers.current.get(imageId))
    timers.current.delete(imageId)
    setRecent((current) => {
      if (!current.has(imageId)) return current
      const next = new Map(current)
      next.delete(imageId)
      return next
    })
  }, [])

  const remember = useCallback(
    (imageId: string) => {
      if (!autoSave) return
      const before = itemsRef.current.find((entry) => entry.imageId === imageId)
      if (!before) return
      setRecent((current) => (current.has(imageId) ? current : new Map(current).set(imageId, before)))
      clearTimeout(timers.current.get(imageId))
      timers.current.set(
        imageId,
        setTimeout(() => forget(imageId), UNDO_MS),
      )
    },
    [autoSave, forget],
  )

  const setCaption = useCallback(
    (imageId: string, caption: string) => {
      if (itemsRef.current.find((entry) => entry.imageId === imageId)?.caption === caption) return
      remember(imageId)
      update(imageId, (entry) => (entry.caption === caption ? entry : { ...entry, caption }))
    },
    [update, remember],
  )
  const setDecorative = useCallback(
    (imageId: string, decorative: boolean) => {
      remember(imageId)
      update(imageId, (entry) => ({ ...entry, decorative }))
    },
    [update, remember],
  )
  const undo = useCallback(
    (imageId: string) => {
      const previous = recent.get(imageId)
      if (!previous) return
      forget(imageId)
      update(imageId, () => previous)
    },
    [recent, forget, update],
  )

  const saveStates = useMemo(() => {
    const states = new Map<string, CaptionSaveState>()
    for (const imageId of recent.keys()) states.set(imageId, edits.saving || edits.editedKeys.has(imageId) ? "saving" : "saved")
    return states
  }, [recent, edits.saving, edits.editedKeys])

  return { ...edits, setCaption, setDecorative, autoSave, saveStates, undo }
}

export type CaptionEdits = ReturnType<typeof useCaptionEdits>
