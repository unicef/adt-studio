import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type PageDetail } from "@/api/client"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import type { CaptionEntry, CaptioningData } from "@/components/pipeline/stages/captions/lib/types"
import type { DraftStore } from "../shared/pageview/draftStore"
import { useDocumentEdits } from "../shared/useDocumentEdits"
import { sameCaption, stampSources } from "./captionSources"

const captionsOf = (doc: CaptioningData) => doc.captions
const withCaptions = (doc: CaptioningData, captions: CaptionEntry[]): CaptioningData => ({ ...doc, captions: stampSources(captions, doc.captions) })
const imageKey = (entry: CaptionEntry) => entry.imageId

export function useCaptionEdits(label: string, pageId: string, page: PageDetail | undefined, locked: boolean, store?: DraftStore<CaptionEntry>) {
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
    lockedReason: t`Wait for Image Captions to finish.`,
    scope,
    keepDraft,
  })

  const { update } = edits
  const setCaption = useCallback(
    (imageId: string, caption: string) => update(imageId, (entry) => (entry.caption === caption ? entry : { ...entry, caption })),
    [update],
  )
  const setDecorative = useCallback(
    (imageId: string, decorative: boolean) => update(imageId, (entry) => ({ ...entry, decorative })),
    [update],
  )

  return { ...edits, setCaption, setDecorative }
}

export type CaptionEdits = ReturnType<typeof useCaptionEdits>
