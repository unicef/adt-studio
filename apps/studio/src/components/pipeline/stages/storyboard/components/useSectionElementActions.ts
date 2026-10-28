import { useCallback, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { ContentNodeData } from "@adt/types"
import { replaceNodeId } from "@adt/types"
import { api, BASE_URL, type PageDetail } from "@/api/client"
import {
  replaceNodeWithSiblings,
  segmentImageInHtml,
  swapImageInHtml,
  withSectionNodes,
  type SectioningData,
  type SelectedElementInfo,
} from "../lib/section-element-edits"
import type { SegmentRegion } from "./SegmentPreviewDialog"
import type { StyleEditorElementProps } from "./style-editor/ElementActions"

export interface SectionElementAdapter {
  bookLabel: string
  pageId: string
  sectionIndex: number
  imagesMeta: PageDetail["imagesMeta"]
  apiKey: string
  storyboardRunning: boolean
  hasImageProvider: boolean
  hasStructuredTextProvider: boolean
  updateSectioning: (updater: (base: SectioningData) => SectioningData) => void
  updateSectionHtml: (updater: (html: string) => string) => void
  onImagesChanged?: () => void
  onError: (message: string, transient?: boolean) => void
  onCropped?: () => void
  onAiImageSubmitted?: (taskId: string, targetImageId: string) => void
  toggleLeafPruned: (dataId: string) => void
  setLeafRole: (dataId: string, role: string) => void
  deleteElement?: (dataId: string) => void
}

export interface SegmentPreviewState {
  imageId: string
  imageSrc: string
  imageWidth: number
  imageHeight: number
  regions: SegmentRegion[]
}

function swapNodeIn(base: SectioningData, sectionIndex: number, targetId: string, newImageId: string): SectioningData {
  const target = base.sections[sectionIndex]
  if (!target) return base
  const nextNodes = replaceNodeId(target.nodes, targetId, newImageId)
  return nextNodes === target.nodes ? base : withSectionNodes(base, sectionIndex, nextNodes)
}

export function useSectionElementActions(adapter: SectionElementAdapter) {
  const { t } = useLingui()
  const latest = useRef(adapter)
  latest.current = adapter
  const [cropTarget, setCropTarget] = useState<string | null>(null)
  const [recropPageSrc, setRecropPageSrc] = useState<string | null>(null)
  const [replaceFromBookTarget, setReplaceFromBookTarget] = useState<string | null>(null)
  const [aiImageDialogTarget, setAiImageDialogTarget] = useState<string | null>(null)
  const [segmenting, setSegmenting] = useState(false)
  const [segmentPreview, setSegmentPreview] = useState<SegmentPreviewState | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)

  const swapImage = useCallback((targetId: string, newImageId: string) => {
    const current = latest.current
    current.updateSectioning((base) => swapNodeIn(base, current.sectionIndex, targetId, newImageId))
    current.updateSectionHtml((html) => swapImageInHtml(html, current.bookLabel, targetId, newImageId))
    current.onImagesChanged?.()
  }, [])

  const applyCrop = useCallback(
    async (blob: Blob) => {
      if (!cropTarget) return
      const { bookLabel, pageId } = latest.current
      const result = await api.uploadCroppedImage(bookLabel, pageId, cropTarget, blob)
      swapImage(cropTarget, result.imageId)
      setCropTarget(null)
      setRecropPageSrc(null)
      latest.current.onCropped?.()
    },
    [cropTarget, swapImage],
  )

  const recropFromPage = useCallback(
    async (dataId: string) => {
      const { bookLabel, pageId } = latest.current
      try {
        const { imageBase64 } = await api.getPageImage(bookLabel, pageId)
        setCropTarget(dataId)
        setRecropPageSrc(`data:image/png;base64,${imageBase64}`)
      } catch (err) {
        latest.current.onError(err instanceof Error ? err.message : t`Failed to load page image`)
      }
    },
    [t],
  )

  const replaceImage = useCallback((dataId: string) => {
    replaceTargetRef.current = dataId
    fileInputRef.current?.click()
  }, [])

  const uploadReplacement = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      const targetId = replaceTargetRef.current
      if (!file || !targetId) return
      e.target.value = ""
      replaceTargetRef.current = null
      const { bookLabel, pageId } = latest.current
      let result: { imageId: string; width: number; height: number }
      try {
        result = await api.uploadCroppedImage(bookLabel, pageId, targetId, file)
      } catch (err) {
        latest.current.onError(err instanceof Error ? err.message : t`Image upload failed`)
        return
      }
      swapImage(targetId, result.imageId)
    },
    [swapImage, t],
  )

  const selectFromBook = useCallback(
    (newImageId: string) => {
      const targetId = replaceFromBookTarget
      if (!targetId) return
      setReplaceFromBookTarget(null)
      swapImage(targetId, newImageId)
    },
    [replaceFromBookTarget, swapImage],
  )

  const submitAiImage = useCallback(
    async (prompt: string, referenceImageId?: string, options?: { style?: string; imageType?: string; styleImageId?: string }) => {
      const targetId = aiImageDialogTarget
      if (!targetId) return
      setAiImageDialogTarget(null)
      const { bookLabel, pageId, apiKey, sectionIndex } = latest.current
      try {
        const result = await api.aiGenerateImage(bookLabel, pageId, prompt, apiKey, targetId, referenceImageId, undefined, {
          ...options,
          sectionIndex,
          mode: "swap",
        })
        if (result.taskId) latest.current.onAiImageSubmitted?.(result.taskId, targetId)
      } catch (err) {
        console.error("[ai-image] Task submission failed:", err)
      }
    },
    [aiImageDialogTarget],
  )

  const segment = useCallback(
    async (dataId: string) => {
      const { bookLabel, pageId, apiKey, hasStructuredTextProvider } = latest.current
      if (!hasStructuredTextProvider) return
      setSegmenting(true)
      try {
        const result = await api.segmentImage(bookLabel, dataId, pageId, apiKey)
        if (!result.segmented || !result.regions || result.regions.length === 0) {
          latest.current.onError(t`No segmentation needed for this image`, true)
          return
        }
        setSegmentPreview({
          imageId: dataId,
          imageSrc: `${BASE_URL}/books/${bookLabel}/images/${dataId}`,
          imageWidth: result.imageWidth!,
          imageHeight: result.imageHeight!,
          regions: result.regions,
        })
      } catch (err) {
        latest.current.onError(err instanceof Error ? err.message : t`Segmentation failed`)
      } finally {
        setSegmenting(false)
      }
    },
    [t],
  )

  const applySegments = useCallback(
    async (confirmedRegions: SegmentRegion[]) => {
      if (!segmentPreview) return
      const { imageId } = segmentPreview
      setSegmentPreview(null)
      const { bookLabel, pageId, sectionIndex } = latest.current
      try {
        const result = await api.applySegmentation(bookLabel, imageId, pageId, confirmedRegions)
        if (!result.segments || result.segments.length === 0) {
          latest.current.onError(t`Segmentation produced no valid segments`)
          return
        }
        latest.current.updateSectioning((base) => {
          const target = base.sections[sectionIndex]
          if (!target) return base
          const leaves: ContentNodeData[] = result.segments.map((seg) => ({ nodeId: seg.imageId, role: "image", isPruned: false }))
          const nextNodes = replaceNodeWithSiblings(target.nodes, imageId, leaves)
          return nextNodes === target.nodes ? base : withSectionNodes(base, sectionIndex, nextNodes)
        })
        latest.current.updateSectionHtml((html) => segmentImageInHtml(html, bookLabel, imageId, result.segments))
      } catch (err) {
        latest.current.onError(err instanceof Error ? err.message : t`Segmentation apply failed`)
      }
    },
    [segmentPreview, t],
  )

  const reset = useCallback(() => {
    setCropTarget(null)
    setRecropPageSrc(null)
    setAiImageDialogTarget(null)
  }, [])

  const elementProps = (info: SelectedElementInfo): StyleEditorElementProps => {
    const { storyboardRunning, hasImageProvider, hasStructuredTextProvider } = adapter
    const image = info.isImage && !storyboardRunning
    return {
      isImage: info.isImage,
      isContainer: info.isContainer,
      textType: info.textType,
      isPruned: info.isPruned,
      imageSrc: info.imageSrc,
      segmenting,
      onChangeTextType: storyboardRunning || info.isContainer ? undefined : adapter.setLeafRole,
      onTogglePrune: storyboardRunning || (info.isContainer && !info.hasTreeNode) ? undefined : adapter.toggleLeafPruned,
      onCrop: image ? (dataId) => setCropTarget(dataId) : undefined,
      onRecropFromPage: image ? recropFromPage : undefined,
      onReplace: image ? replaceImage : undefined,
      onReplaceFromBook: image ? (dataId) => setReplaceFromBookTarget(dataId) : undefined,
      onAiImage: image && hasImageProvider ? (dataId) => setAiImageDialogTarget(dataId) : undefined,
      onSegment: image && hasStructuredTextProvider ? segment : undefined,
      onDelete: !storyboardRunning ? adapter.deleteElement : undefined,
    }
  }

  return {
    elementProps,
    reset,
    dialogs: {
      bookLabel: adapter.bookLabel,
      imagesMeta: adapter.imagesMeta,
      fileInputRef,
      uploadReplacement,
      cropTarget,
      recropPageSrc,
      applyCrop,
      closeCrop: () => {
        setCropTarget(null)
        setRecropPageSrc(null)
      },
      replaceFromBookTarget,
      selectFromBook,
      closeReplaceFromBook: () => setReplaceFromBookTarget(null),
      aiImageDialogTarget,
      submitAiImage,
      closeAiImage: () => setAiImageDialogTarget(null),
      segmentPreview,
      applySegments,
      closeSegment: () => setSegmentPreview(null),
    },
  }
}

export type SectionElementActions = ReturnType<typeof useSectionElementActions>
