import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, Copy, Eye, EyeOff, LayoutGrid, Layers, Loader2, ChevronDown, Sparkles, ChevronRight, PanelRightOpen, PanelRightClose, Play, PenLine, Save, X } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, BASE_URL } from "@/api/client"
import type { PageDetail, VersionEntry } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStepHeader } from "../StepViewRouter"
import { BookPreviewFrame, type BookPreviewFrameHandle } from "./BookPreviewFrame"
import { SectionEditToolbar } from "./SectionEditToolbar"
import { ImageCropDialog } from "./ImageCropDialog"
import { AiImageDialog } from "./AiImageDialog"
import { SegmentPreviewDialog, type SegmentRegion } from "./SegmentPreviewDialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

// -- AI loading messages --

const AI_MESSAGES = [
  "Rewriting the story of this section...",
  "Teaching the pixels new tricks...",
  "Asking the AI to put on its creative hat...",
  "Rearranging atoms of HTML...",
  "Consulting the style council...",
  "Sprinkling some digital fairy dust...",
  "The AI is having a think...",
  "Brewing a fresh batch of HTML...",
  "Polishing paragraphs to perfection...",
  "Untangling nested divs with care...",
]

// -- VersionPicker (same as ExtractPageDetail) --

function VersionPicker({
  currentVersion,
  saving,
  dirty,
  bookLabel,
  node,
  itemId,
  onPreview,
  onSave,
  onDiscard,
  inline,
}: {
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
  node: string
  itemId: string
  onPreview: (data: unknown) => void
  onSave?: () => void
  onDiscard: () => void
  /** When true, removes ml-auto so the picker sits inline */
  inline?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleOpen = async () => {
    if (saving || currentVersion == null) return
    setOpen(true)
    setLoading(true)
    const res = await api.getVersionHistory(bookLabel, node, itemId, true)
    setVersions(res.versions)
    setLoading(false)
  }

  const handlePick = (v: VersionEntry) => {
    if (v.version === currentVersion && !dirty) {
      setOpen(false)
      return
    }
    setOpen(false)
    onPreview(v.data)
  }

  if (saving) {
    return <Loader2 className={`h-3 w-3 animate-spin ${inline ? "text-white/60" : "ml-auto"}`} />
  }

  if (currentVersion == null) return null

  if (dirty) {
    return (
      <div className={`flex items-center gap-1.5 ${inline ? "" : "ml-auto"}`}>
        <button
          type="button"
          onClick={onDiscard}
          className={`text-[10px] font-medium rounded px-2 py-0.5 cursor-pointer transition-colors ${
            inline
              ? "bg-white/15 hover:bg-white/25 text-white"
              : "bg-muted hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          Discard
        </button>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-colors"
          >
            <Check className="h-3 w-3" />
            Save
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className={`relative ${inline ? "" : "ml-auto"}`}>
      <button
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal rounded px-1.5 py-0.5 transition-colors ${
          inline
            ? "bg-white/15 hover:bg-white/25 text-white"
            : "bg-muted hover:bg-muted/80"
        }`}
      >
        v{currentVersion}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-popover border rounded shadow-md min-w-[80px] py-1">
          {loading ? (
            <div className="flex items-center justify-center py-2 px-3">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            versions.map((v) => (
              <button
                key={v.version}
                type="button"
                onClick={() => handlePick(v)}
                className={`w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors ${
                  v.version === currentVersion ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                v{v.version}
              </button>
            ))
          ) : (
            <div className="px-3 py-1 text-xs text-muted-foreground">No versions</div>
          )}
        </div>
      )}
    </div>
  )
}

// -- ImageCard --

function ImageCard({ imageId, bookLabel, isPruned, reason }: { imageId: string; bookLabel: string; isPruned?: boolean; reason?: string }) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  return (
    <div
      className={`relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[80px] transition-opacity duration-300 ${isPruned ? "opacity-40" : ""}`}
      title={isPruned ? `Pruned: ${reason}` : undefined}
    >
      <img
        src={`${BASE_URL}/books/${bookLabel}/images/${imageId}`}
        alt={imageId}
        className={`max-w-full h-auto block my-auto ${isPruned ? "grayscale" : ""}`}
        onLoad={(e) => {
          const img = e.target as HTMLImageElement
          setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = "none"
        }}
      />
      <div className="px-2 py-1 flex items-center justify-between border-t bg-muted/30 w-full mt-auto">
        <span className="text-[10px] text-muted-foreground truncate">{imageId}</span>
        {dimensions && (
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
            {dimensions.w}&times;{dimensions.h}
          </span>
        )}
      </div>
    </div>
  )
}

// -- Types --

type SectioningData = NonNullable<PageDetail["sectioning"]>
type RenderingData = NonNullable<PageDetail["rendering"]>

function getRenderedSectionByIndex(
  rendering: RenderingData | null | undefined,
  sectionIndex: number
) {
  return rendering?.sections.find((s) => s.sectionIndex === sectionIndex)
}

// -- Helpers --

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Parse a data-id like "pg001_gp001_tx001" to find the matching text entry
 * in the sectioning data. Returns { groupIndex, textIndex } within the section's parts.
 */
function findTextByDataId(
  parts: SectioningData["sections"][0]["parts"],
  dataId: string
): { partIndex: number; textIndex: number } | null {
  // data-id format: {pageId}_gp{NNN}_tx{NNN}
  const match = dataId.match(/^(.+_gp\d+)_tx(\d+)$/)
  if (!match) return null
  const groupId = match[1]
  const textIdx = parseInt(match[2], 10) - 1 // tx001 → index 0

  for (let pi = 0; pi < parts.length; pi++) {
    const p = parts[pi]
    if (p.type === "text_group" && p.groupId === groupId) {
      if (textIdx >= 0 && textIdx < p.texts.length) {
        return { partIndex: pi, textIndex: textIdx }
      }
    }
  }
  return null
}

/**
 * Back-propagate text changes from edited HTML into sectioning data.
 * Parses data-id elements from HTML and updates matching text entries.
 */
function backPropagateTextChanges(
  sectioning: SectioningData,
  sectionIndex: number,
  fullHtml: string
): SectioningData {
  // Parse text content from data-id elements in the HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(fullHtml, "text/html")
  const dataIdElements = doc.querySelectorAll("[data-id]")

  const textMap = new Map<string, string>()
  dataIdElements.forEach((el) => {
    const id = el.getAttribute("data-id")
    if (id && el.tagName !== "IMG") {
      textMap.set(id, el.textContent?.trim() ?? "")
    }
  })

  if (textMap.size === 0) return sectioning

  return {
    ...sectioning,
    sections: sectioning.sections.map((s, si) => {
      if (si !== sectionIndex) return s
      return {
        ...s,
        parts: s.parts.map((p) => {
          if (p.type !== "text_group") return p
          return {
            ...p,
            texts: p.texts.map((t, ti) => {
              const textId = `${p.groupId}_tx${String(ti + 1).padStart(3, "0")}`
              const newText = textMap.get(textId)
              if (newText !== undefined && newText !== t.text) {
                return { ...t, text: newText }
              }
              return t
            }),
          }
        }),
      }
    }),
  }
}

// -- Main component --

export function StoryboardSectionDetail({
  bookLabel,
  pageId,
  sectionIndex,
  page,
  navigationExtra,
  navigationArrows,
  onGeneratingChange,
  onNavigateSection,
}: {
  bookLabel: string
  pageId: string
  sectionIndex: number
  page: PageDetail
  /** Page/section label rendered in the purple header */
  navigationExtra?: ReactNode
  /** Prev/next arrow buttons rendered at the far right of the purple header */
  navigationArrows?: ReactNode
  /** Called when AI image generation starts/stops so parent can guard navigation */
  onGeneratingChange?: (generating: boolean) => void
  /** Called to navigate to a different section index (e.g. after clone) */
  onNavigateSection?: (index: number) => void
}) {
  const queryClient = useQueryClient()
  const { apiKey, hasApiKey } = useApiKey()
  const { headerSlotEl } = useStepHeader()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const applyBodyBackground = (activeConfigData?.merged as Record<string, unknown> | undefined)?.apply_body_background !== false

  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [rerendering, setRerendering] = useState(false)
  const [pendingSectioning, setPendingSectioning] = useState<SectioningData | null>(null)
  const [pendingRendering, setPendingRendering] = useState<RenderingData | null>(null)

  // Inline editing state
  const [selectedElement, setSelectedElement] = useState<{
    dataId: string
    rect: DOMRect
    iframeTop: number
    iframeLeft: number
  } | null>(null)
  const previewFrameRef = useRef<BookPreviewFrameHandle>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Track current pageId so async callbacks can detect stale closures
  const pageIdRef = useRef(pageId)
  pageIdRef.current = pageId

  // Section data panel state
  const [panelOpen, setPanelOpen] = useState(false)

  // Image crop state
  const [cropTarget, setCropTarget] = useState<string | null>(null)

  // Image replace / AI image state
  const [aiImageDialogTarget, setAiImageDialogTarget] = useState<string | null>(null)
  const [aiImageGen, setAiImageGen] = useState<{
    targetImageId: string
    status: "generating" | "done" | "error"
    error?: string
  } | null>(null)
  const aiImageAbortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)

  // Image segmentation state
  const [segmenting, setSegmenting] = useState(false)
  const [segmentPreview, setSegmentPreview] = useState<{
    imageId: string
    imageSrc: string
    imageWidth: number
    imageHeight: number
    regions: SegmentRegion[]
  } | null>(null)

  // Notify parent when AI image generation starts/stops
  useEffect(() => {
    onGeneratingChange?.(aiImageGen?.status === "generating")
  }, [aiImageGen?.status])

  // Activity preview mode (try the activity in the editor)
  const [activityPreviewMode, setActivityPreviewMode] = useState(false)

  // AI edit state
  const [aiInstruction, setAiInstruction] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReasoning, setAiReasoning] = useState<string | null>(null)
  const [aiReasoningOpen, setAiReasoningOpen] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const aiAbortRef = useRef<AbortController | null>(null)

  const [aiMessageIdx, setAiMessageIdx] = useState(0)

  // Rotating witty messages during AI generation
  useEffect(() => {
    if (!aiLoading) {
      setAiMessageIdx(Math.floor(Math.random() * AI_MESSAGES.length))
      return
    }
    const rotate = setInterval(
      () => setAiMessageIdx((i) => (i + 1) % AI_MESSAGES.length),
      3000
    )
    return () => clearInterval(rotate)
  }, [aiLoading])

  // Fetch active config for type dropdowns
  const configQuery = useQuery({
    queryKey: ["books", bookLabel, "config", "active"],
    queryFn: () => api.getActiveConfig(bookLabel),
    staleTime: 5 * 60 * 1000,
  })

  const textTypes = configQuery.data?.merged?.text_types as Record<string, string> | undefined
  const allSectionTypes = configQuery.data?.merged?.section_types as Record<string, string> | undefined
  const disabledSectionTypes = new Set(configQuery.data?.merged?.disabled_section_types as string[] ?? [])
  const sectionTypes = allSectionTypes
    ? Object.fromEntries(Object.entries(allSectionTypes).filter(([key]) => !disabledSectionTypes.has(key)))
    : undefined

  // Abort in-flight requests when the component unmounts
  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort()
      aiImageAbortRef.current?.abort()
    }
  }, [])

  // Clear pending state and abort ALL in-flight requests when page changes
  useEffect(() => {
    setPendingSectioning(null)
    setPendingRendering(null)
    setSelectedElement(null)
    setCropTarget(null)
    setAiImageDialogTarget(null)
    aiAbortRef.current?.abort()
    aiImageAbortRef.current?.abort()
    setAiImageGen(null)
    setAiInstruction("")
    setAiLoading(false)
    setAiReasoning(null)
    setAiReasoningOpen(false)
    setAiError(null)
    setRerendering(false)
    setSaving(false)
    setActivityPreviewMode(false)
  }, [pageId, sectionIndex])

  // Reset scroll position when page or section changes
  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0)
  }, [pageId, sectionIndex])

  // Dismiss toolbar on scroll (position would be stale)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const onScroll = () => setSelectedElement(null)
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [])

  // Effective data
  const sectioningData = pendingSectioning ?? page.sectioning
  const dirty = pendingSectioning != null

  // Current section data
  const section = sectioningData?.sections[sectionIndex]
  const renderingData = pendingRendering ?? page.rendering
  const renderedSection = getRenderedSectionByIndex(renderingData, sectionIndex)
  const renderingDirty = pendingRendering != null

  if (!section) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Section not found.
      </div>
    )
  }

  // Parts are inline in the section data
  const parts = section.parts

  // Save / discard sectioning
  const saveSectioning = async () => {
    if (!pendingSectioning) return
    setSaving(true)
    setPanelOpen(false)
    try {
      const minDelay = new Promise((r) => setTimeout(r, 400))
      await api.updateSectioning(bookLabel, pageId, pendingSectioning)
      setPendingSectioning(null)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await minDelay

      // Automatically re-render with the updated sectioning
      if (hasApiKey) {
        setRerendering(true)
        const capturedPageId = pageId
        api.reRenderPage(bookLabel, pageId, apiKey, sectionIndex)
          .then(() => {
            // Discard if user navigated to a different page
            if (pageIdRef.current !== capturedPageId) return
            queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", capturedPageId] })
            queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
          })
          .catch(() => {
            // Re-render failed — overlay will be cleared by finally
          })
          .finally(() => {
            if (pageIdRef.current === capturedPageId) {
              setRerendering(false)
            }
          })
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const discardSectioning = () => {
    setPendingSectioning(null)
  }

  // Save rendering (including back-propagation to sectioning)
  const saveRendering = async () => {
    if (!pendingRendering) return
    setSaving(true)
    setPanelOpen(false)
    try {
      const minDelay = new Promise((r) => setTimeout(r, 400))

      // Save the rendering
      await api.updateRendering(bookLabel, pageId, pendingRendering)

      // Back-propagate: if we have sectioning data and edited HTML, update sectioning too
      const editedHtml = getRenderedSectionByIndex(pendingRendering, sectionIndex)?.html
      if (editedHtml && page.sectioning) {
        const updatedSectioning = backPropagateTextChanges(
          pendingSectioning ?? page.sectioning,
          sectionIndex,
          editedHtml
        )
        await api.updateSectioning(bookLabel, pageId, updatedSectioning)
      }

      setPendingRendering(null)
      setPendingSectioning(null)
      setAiReasoning(null)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await minDelay
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  // Clone current section
  const handleCloneSection = async () => {
    if (cloning || dirty || renderingDirty || saving) return
    setCloning(true)
    try {
      const result = await api.cloneSection(bookLabel, pageId, sectionIndex)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      onNavigateSection?.(result.clonedSectionIndex)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Clone failed")
    } finally {
      setCloning(false)
    }
  }

  // Toggle isPruned on a part within the current section
  const togglePartPruned = (partIndex: number) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        return {
          ...s,
          parts: s.parts.map((p, pi) => {
            if (pi !== partIndex) return p
            return { ...p, isPruned: !p.isPruned }
          }),
        }
      }),
    }
    setPendingSectioning(updated)
  }

  // Toggle isPruned on the current section
  const toggleSectionPruned = () => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        return { ...s, isPruned: !s.isPruned }
      }),
    }
    setPendingSectioning(updated)
  }

  // Change section type
  const changeSectionType = (newType: string) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        return { ...s, sectionType: newType }
      }),
    }
    setPendingSectioning(updated)
  }

  // Change text type for a specific text entry
  const changeTextType = (partIndex: number, textIndex: number, newType: string) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        return {
          ...s,
          parts: s.parts.map((p, pi) => {
            if (pi !== partIndex || p.type !== "text_group") return p
            return {
              ...p,
              texts: p.texts.map((t, ti) => {
                if (ti !== textIndex) return t
                return { ...t, textType: newType }
              }),
            }
          }),
        }
      }),
    }
    setPendingSectioning(updated)
  }

  // Handle inline text edit from BookPreviewFrame
  const handleTextChanged = useCallback(
    (_dataId: string, _newText: string, fullHtml: string) => {
      if (!page.rendering) return
      const base = pendingRendering ?? page.rendering
      const updated: RenderingData = {
        ...base,
        sections: base.sections.map((s) => {
          if (s.sectionIndex !== sectionIndex) return s
          return { ...s, html: fullHtml }
        }),
      }
      setPendingRendering(updated)
      setSelectedElement(null)
    },
    [page.rendering, pendingRendering, sectionIndex]
  )

  // Handle element selection from BookPreviewFrame
  const handleSelectElement = useCallback((dataId: string, rect: DOMRect) => {
    if (!dataId) {
      setSelectedElement(null)
      return
    }
    // Capture iframe viewport position at click time for accurate toolbar placement
    const iframeRect = previewFrameRef.current?.getIframeRect()
    setSelectedElement({
      dataId,
      rect,
      iframeTop: iframeRect?.top ?? 0,
      iframeLeft: iframeRect?.left ?? 0,
    })
  }, [])

  // Handle toolbar prune toggle
  const handleToolbarPrune = useCallback(
    (dataId: string) => {
      if (!sectioningData) return
      const loc = findTextByDataId(parts, dataId)
      if (loc) {
        // Toggle prune on a text within a text_group
        const base = pendingSectioning ?? page.sectioning
        if (!base) return
        const updated: SectioningData = {
          ...base,
          sections: base.sections.map((s, si) => {
            if (si !== sectionIndex) return s
            return {
              ...s,
              parts: s.parts.map((p, pi) => {
                if (pi !== loc.partIndex || p.type !== "text_group") return p
                return {
                  ...p,
                  texts: p.texts.map((t, ti) => {
                    if (ti !== loc.textIndex) return t
                    return { ...t, isPruned: !t.isPruned }
                  }),
                }
              }),
            }
          }),
        }
        setPendingSectioning(updated)
      } else {
        // Could be an image — find by imageId
        const imgIdx = parts.findIndex(
          (p) => p.type === "image" && p.imageId === dataId
        )
        if (imgIdx >= 0) togglePartPruned(imgIdx)
      }
      setSelectedElement(null)
    },
    [parts, sectioningData, pendingSectioning, page.sectioning, sectionIndex]
  )

  // Handle toolbar text type change
  const handleToolbarChangeTextType = useCallback(
    (dataId: string, newType: string) => {
      const loc = findTextByDataId(parts, dataId)
      if (loc) {
        changeTextType(loc.partIndex, loc.textIndex, newType)
      }
    },
    [parts, pendingSectioning, page.sectioning, sectionIndex]
  )

  // Handle crop apply: upload cropped image, update sectioning + rendering HTML
  const handleCropApply = useCallback(
    async (blob: Blob) => {
      if (!cropTarget) return
      const result = await api.uploadCroppedImage(bookLabel, pageId, cropTarget, blob)

      // 1. Update sectioning to replace old imageId with new one
      const sBase = pendingSectioning ?? page.sectioning
      if (sBase) {
        const updatedSectioning: SectioningData = {
          ...sBase,
          sections: sBase.sections.map((s, si) => {
            if (si !== sectionIndex) return s
            return {
              ...s,
              parts: s.parts.map((p) => {
                if (p.type === "image" && p.imageId === cropTarget) {
                  return { ...p, imageId: result.imageId }
                }
                return p
              }),
            }
          }),
        }
        setPendingSectioning(updatedSectioning)
      }

      // 2. Update rendered HTML to swap image references so preview reflects the crop
      const rBase = pendingRendering ?? page.rendering
      if (rBase) {
        const oldSrc = `${BASE_URL}/books/${bookLabel}/images/${cropTarget}`
        const newSrc = `${BASE_URL}/books/${bookLabel}/images/${result.imageId}`
        const updatedRendering: RenderingData = {
          ...rBase,
          sections: rBase.sections.map((s) => {
            if (s.sectionIndex !== sectionIndex) return s
            // Replace data-id and src references to the old imageId
            let html = s.html
            html = html.replace(new RegExp(`data-id="${escapeRegex(cropTarget)}"`, "g"), `data-id="${result.imageId}"`)
            html = html.replace(new RegExp(escapeRegex(oldSrc), "g"), newSrc)
            return { ...s, html }
          }),
        }
        setPendingRendering(updatedRendering)
      }

      setCropTarget(null)
      setSelectedElement(null)
    },
    [cropTarget, bookLabel, pageId, pendingSectioning, page.sectioning, pendingRendering, page.rendering, sectionIndex]
  )

  // Image replace: open native file picker
  const handleImageReplace = useCallback((dataId: string) => {
    replaceTargetRef.current = dataId
    fileInputRef.current?.click()
    setSelectedElement(null)
  }, [])

  // Process uploaded file: upload to API, swap image in sectioning + rendering
  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      const targetId = replaceTargetRef.current
      if (!file || !targetId) return
      e.target.value = "" // reset so same file can be re-selected
      replaceTargetRef.current = null

      let result: { imageId: string; width: number; height: number }
      try {
        result = await api.uploadCroppedImage(bookLabel, pageId, targetId, file)
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "Image upload failed")
        return
      }

      // Update sectioning
      const sBase = pendingSectioning ?? page.sectioning
      if (sBase) {
        const updatedSectioning: SectioningData = {
          ...sBase,
          sections: sBase.sections.map((s, si) => {
            if (si !== sectionIndex) return s
            return {
              ...s,
              parts: s.parts.map((p) => {
                if (p.type === "image" && p.imageId === targetId) {
                  return { ...p, imageId: result.imageId }
                }
                return p
              }),
            }
          }),
        }
        setPendingSectioning(updatedSectioning)
      }

      // Update rendering HTML
      const rBase = pendingRendering ?? page.rendering
      if (rBase) {
        const oldSrc = `${BASE_URL}/books/${bookLabel}/images/${targetId}`
        const newSrc = `${BASE_URL}/books/${bookLabel}/images/${result.imageId}`
        const updatedRendering: RenderingData = {
          ...rBase,
          sections: rBase.sections.map((s) => {
            if (s.sectionIndex !== sectionIndex) return s
            let html = s.html
            html = html.replace(new RegExp(`data-id="${escapeRegex(targetId)}"`, "g"), `data-id="${result.imageId}"`)
            html = html.replace(new RegExp(escapeRegex(oldSrc), "g"), newSrc)
            return { ...s, html }
          }),
        }
        setPendingRendering(updatedRendering)
      }
    },
    [bookLabel, pageId, pendingSectioning, page.sectioning, pendingRendering, page.rendering, sectionIndex]
  )

  // Open AI image dialog for a specific image
  const handleAiImage = useCallback((dataId: string) => {
    setAiImageDialogTarget(dataId)
    setSelectedElement(null)
  }, [])

  // Run LLM segmentation analysis on a single image (phase 1: get bounding boxes)
  const handleSegment = useCallback(
    async (dataId: string) => {
      if (!hasApiKey) return
      setSegmenting(true)
      setSelectedElement(null)

      try {
        const result = await api.segmentImage(bookLabel, dataId, pageId, apiKey)

        if (!result.segmented || !result.regions || result.regions.length === 0) {
          setAiError("No segmentation needed for this image")
          setTimeout(() => setAiError((prev) => prev === "No segmentation needed for this image" ? null : prev), 3000)
          return
        }

        // Show preview dialog with bounding boxes
        setSegmentPreview({
          imageId: dataId,
          imageSrc: `${BASE_URL}/books/${bookLabel}/images/${dataId}`,
          imageWidth: result.imageWidth!,
          imageHeight: result.imageHeight!,
          regions: result.regions,
        })
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "Segmentation failed")
      } finally {
        setSegmenting(false)
      }
    },
    [bookLabel, pageId, apiKey, hasApiKey]
  )

  // Apply confirmed segmentation (phase 2: crop and save)
  const handleSegmentApply = useCallback(
    async (confirmedRegions: SegmentRegion[]) => {
      if (!segmentPreview) return
      const { imageId } = segmentPreview

      // Close the dialog FIRST, before any async work or state updates.
      // This ensures the dialog unmounts cleanly in its own render cycle,
      // avoiding React DOM reconciliation conflicts with the sectioning/rendering updates.
      setSegmentPreview(null)

      try {
        const result = await api.applySegmentation(bookLabel, imageId, pageId, confirmedRegions)

        if (!result.segments || result.segments.length === 0) {
          setAiError("Segmentation produced no valid segments")
          return
        }

        // Replace the original image with segment images in sectioning
        setPendingSectioning((prev) => {
          const sBase = prev ?? page.sectioning
          if (!sBase) return prev
          return {
            ...sBase,
            sections: sBase.sections.map((s, si) => {
              if (si !== sectionIndex) return s
              const newParts: typeof s.parts = []
              for (const p of s.parts) {
                if (p.type === "image" && p.imageId === imageId) {
                  for (const seg of result.segments) {
                    newParts.push({ type: "image", imageId: seg.imageId, isPruned: false })
                  }
                } else {
                  newParts.push(p)
                }
              }
              return { ...s, parts: newParts }
            }),
          }
        })

        // Replace the original <img> tag with segment <img> tags in rendering HTML
        setPendingRendering((prev) => {
          const rBase = prev ?? page.rendering
          if (!rBase) return prev
          return {
            ...rBase,
            sections: rBase.sections.map((s) => {
              if (s.sectionIndex !== sectionIndex) return s
              let html = s.html
              const segImgs = result.segments
                .map(
                  (seg) =>
                    `<img data-id="${seg.imageId}" src="${BASE_URL}/books/${bookLabel}/images/${seg.imageId}" width="${seg.width}" height="${seg.height}" alt="${seg.label}" class="w-full" />`
                )
                .join("\n")
              const imgPattern = new RegExp(
                `<img[^>]*data-id="${escapeRegex(imageId)}"[^>]*/?>`,
                "g"
              )
              html = html.replace(imgPattern, segImgs)
              return { ...s, html }
            }),
          }
        })
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "Segmentation apply failed")
      }
    },
    [segmentPreview, bookLabel, pageId, page.sectioning, page.rendering, sectionIndex]
  )

  // Swap a generated/edited image into pending sectioning + rendering.
  // Uses functional setState to avoid stale closures from async callers (e.g. AI generation).
  const pageDataRef = useRef({ sectioning: page.sectioning, rendering: page.rendering })
  pageDataRef.current = { sectioning: page.sectioning, rendering: page.rendering }

  const swapImage = useCallback(
    (targetId: string, newImageId: string, originalDims?: { w: number; h: number }) => {
      // Update sectioning using functional form to read latest state
      setPendingSectioning((prev) => {
        const sBase = prev ?? pageDataRef.current.sectioning
        if (!sBase) return prev
        return {
          ...sBase,
          sections: sBase.sections.map((s, si) => {
            if (si !== sectionIndex) return s
            return {
              ...s,
              parts: s.parts.map((p) => {
                if (p.type === "image" && p.imageId === targetId) {
                  return { ...p, imageId: newImageId }
                }
                return p
              }),
            }
          }),
        }
      })

      // Update rendering HTML using functional form
      setPendingRendering((prev) => {
        const rBase = prev ?? pageDataRef.current.rendering
        if (!rBase) return prev
        const oldSrc = `${BASE_URL}/books/${bookLabel}/images/${targetId}`
        const newSrc = `${BASE_URL}/books/${bookLabel}/images/${newImageId}`
        return {
          ...rBase,
          sections: rBase.sections.map((s) => {
            if (s.sectionIndex !== sectionIndex) return s
            let html = s.html
            html = html.replace(new RegExp(`data-id="${escapeRegex(targetId)}"`, "g"), `data-id="${newImageId}"`)
            html = html.replace(new RegExp(escapeRegex(oldSrc), "g"), newSrc)
            // Set width/height to match original so the display size is preserved
            if (originalDims) {
              const escaped = escapeRegex(newImageId)
              html = html.replace(
                new RegExp(`(<img[^>]*data-id="${escaped}"[^>]*?)(/?>)`, "g"),
                (_, before, close) => {
                  let tag = before as string
                  tag = tag.replace(/\s+width="[^"]*"/, "")
                  tag = tag.replace(/\s+height="[^"]*"/, "")
                  return `${tag} width="${originalDims.w}" height="${originalDims.h}"${close}`
                }
              )
            }
            return { ...s, html }
          }),
        }
      })
    },
    [bookLabel, sectionIndex]
  )

  // Submit from AI image dialog: close dialog, run generation in background
  const handleAiImageSubmit = useCallback(
    (prompt: string, referenceImageId?: string) => {
      const targetId = aiImageDialogTarget
      if (!targetId) return
      setAiImageDialogTarget(null)
      setAiImageGen({ targetImageId: targetId, status: "generating" })

      const controller = new AbortController()
      aiImageAbortRef.current = controller

      api
        .aiGenerateImage(bookLabel, pageId, prompt, apiKey, targetId, referenceImageId, controller.signal)
        .then((result) => {
          swapImage(targetId, result.imageId, { w: result.originalWidth, h: result.originalHeight })
          setAiImageGen({ targetImageId: targetId, status: "done" })
          // Auto-dismiss success after 3s
          setTimeout(() => setAiImageGen((prev) => prev?.status === "done" ? null : prev), 3000)
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") {
            setAiImageGen(null)
          } else {
            setAiImageGen({
              targetImageId: targetId,
              status: "error",
              error: err instanceof Error ? err.message : "Image generation failed",
            })
          }
        })
        .finally(() => {
          aiImageAbortRef.current = null
        })
    },
    [aiImageDialogTarget, bookLabel, pageId, apiKey, swapImage]
  )

  // AI edit handler
  const handleAiEdit = async () => {
    if (!aiInstruction.trim() || !hasApiKey || aiLoading) return
    setAiLoading(true)
    setAiError(null)
    setAiReasoning(null)

    const controller = new AbortController()
    aiAbortRef.current = controller

    try {
      // Send current HTML so successive AI edits build on pending changes
      const currentHtml = renderedSection?.html
      const result = await api.aiEditSection(
        bookLabel,
        pageId,
        sectionIndex,
        aiInstruction.trim(),
        apiKey,
        currentHtml,
        controller.signal
      )

      // Discard result if user navigated to a different page during the request
      if (pageIdRef.current !== pageId) return

      // Apply the AI edit as pending rendering
      const base = pendingRendering ?? page.rendering
      if (!base) return
      const updated: RenderingData = {
        ...base,
        sections: base.sections.map((s) => {
          if (s.sectionIndex !== sectionIndex) return s
          return { ...s, html: result.html }
        }),
      }
      setPendingRendering(updated)
      setAiReasoning(result.reasoning)
      setAiInstruction("")
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — not an error
      } else {
        setAiError(err instanceof Error ? err.message : "AI edit failed")
      }
    } finally {
      aiAbortRef.current = null
      setAiLoading(false)
    }
  }

  // Compute toolbar info for selected element
  const getSelectedElementInfo = () => {
    if (!selectedElement || !sectioningData) return null
    const { dataId } = selectedElement
    const isImage = dataId.includes("_im")
    const loc = !isImage ? findTextByDataId(parts, dataId) : null
    const textEntry = loc
      ? (parts[loc.partIndex] as Extract<typeof parts[0], { type: "text_group" }>).texts[loc.textIndex]
      : null

    // For images, find matching part
    const imagePart = isImage
      ? (parts.find((p) => p.type === "image" && p.imageId === dataId) as Extract<typeof parts[0], { type: "image" }> | undefined)
      : null

    return {
      isImage,
      textType: textEntry?.textType,
      isPruned: isImage ? imagePart?.isPruned ?? false : textEntry?.isPruned ?? false,
      imageSrc: isImage ? `${BASE_URL}/books/${bookLabel}/images/${dataId}` : undefined,
    }
  }

  const selectedInfo = selectedElement ? getSelectedElementInfo() : null

  // Compute pruned data-ids for optimistic preview feedback
  const prunedDataIds = useMemo(() => {
    const ids: string[] = []
    for (const p of parts) {
      if (p.type === "image" && p.isPruned) {
        ids.push(p.imageId)
      } else if (p.type === "text_group") {
        // If the whole group is pruned, mark all its text entries
        if (p.isPruned) {
          p.texts.forEach((_, ti) => {
            ids.push(`${p.groupId}_tx${String(ti + 1).padStart(3, "0")}`)
          })
        } else {
          // Individual text entries
          p.texts.forEach((t, ti) => {
            if (t.isPruned) {
              ids.push(`${p.groupId}_tx${String(ti + 1).padStart(3, "0")}`)
            }
          })
        }
      }
    }
    return ids
  }, [parts])

  // Compute changed elements by diffing pending vs saved state
  const changedElements = useMemo(() => {
    if (!pendingRendering && !pendingSectioning) return []
    const changes: Array<{ dataId: string; originalText?: string }> = []
    const seen = new Set<string>()

    // Diff rendered HTML for text edits + image src swaps
    if (pendingRendering && page.rendering) {
      const savedHtml = getRenderedSectionByIndex(page.rendering, sectionIndex)?.html ?? ""
      const pendingHtml = getRenderedSectionByIndex(pendingRendering, sectionIndex)?.html ?? ""
      if (savedHtml !== pendingHtml) {
        const parser = new DOMParser()
        const savedDoc = parser.parseFromString(savedHtml, "text/html")
        const pendingDoc = parser.parseFromString(pendingHtml, "text/html")

        pendingDoc.querySelectorAll("[data-id]").forEach((el) => {
          const dataId = el.getAttribute("data-id")
          if (!dataId || seen.has(dataId)) return
          const savedEl = savedDoc.querySelector(`[data-id="${dataId}"]`)
          if (!savedEl) return // new element — skip (it's an image swap, handled below)
          const isImg = el.tagName === "IMG"
          if (isImg) {
            if (el.getAttribute("src") !== savedEl.getAttribute("src")) {
              seen.add(dataId)
              changes.push({ dataId })
            }
          } else if (el.textContent?.trim() !== savedEl.textContent?.trim()) {
            seen.add(dataId)
            changes.push({ dataId, originalText: savedEl.textContent?.trim() })
          }
        })
      }
    }

    // Diff sectioning for image swaps (imageId changed)
    if (pendingSectioning && page.sectioning) {
      const savedParts = page.sectioning.sections[sectionIndex]?.parts ?? []
      const pendingParts = pendingSectioning.sections[sectionIndex]?.parts ?? []
      for (let i = 0; i < Math.min(savedParts.length, pendingParts.length); i++) {
        const saved = savedParts[i]
        const pending = pendingParts[i]
        if (saved.type === "image" && pending.type === "image" && saved.imageId !== pending.imageId) {
          if (!seen.has(pending.imageId)) {
            seen.add(pending.imageId)
            changes.push({ dataId: pending.imageId, originalText: `Was: ${saved.imageId}` })
          }
        }
      }
    }

    return changes
  }, [pendingRendering, pendingSectioning, page.rendering, page.sectioning, sectionIndex])

  // Check if this section has any text groups or images
  const hasTextParts = parts.some((p) => p.type === "text_group")
  const hasImageParts = parts.some((p) => p.type === "image")

  // Header controls rendered via portal into the purple step header
  const headerControls = (
    <>
      {navigationExtra}
      <button
        type="button"
        onClick={toggleSectionPruned}
        className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer ${
          section.isPruned
            ? "bg-amber-500/30 hover:bg-amber-500/40"
            : "bg-white/10 hover:bg-white/20"
        }`}
        title={section.isPruned ? "Restore section to flow" : "Prune section from flow"}
      >
        {section.isPruned ? (
          <EyeOff className="h-3.5 w-3.5 text-amber-200" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      <VersionPicker
        currentVersion={page.versions.rendering}
        saving={saving}
        dirty={renderingDirty}
        bookLabel={bookLabel}
        node="web-rendering"
        itemId={pageId}
        inline
        onPreview={(data) => setPendingRendering(data as RenderingData)}
        onSave={saveRendering}
        onDiscard={() => {
          setPendingRendering(null)
          setAiReasoning(null)
        }}
      />
      {renderedSection?.html && hasApiKey ? (
        <div className="relative flex-1 min-w-[100px]">
          <Sparkles className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <Input
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleAiEdit()
              }
            }}
            placeholder={aiLoading ? "Generating..." : "Ask AI to edit..."}
            disabled={aiLoading}
            className={`pl-7 h-7 text-[11px] bg-white border-white/40 text-gray-900 placeholder:text-gray-400 focus-visible:ring-white/50 ${aiLoading ? "opacity-60" : ""}`}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors cursor-pointer shrink-0"
        title={panelOpen ? "Close section data" : "Open section data"}
      >
        {panelOpen ? (
          <PanelRightClose className="h-3.5 w-3.5" />
        ) : (
          <PanelRightOpen className="h-3.5 w-3.5" />
        )}
        <span className="text-[10px]">Section Data</span>
        {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
      </button>
      {navigationArrows}
    </>
  )

  return (
    <>
    {headerSlotEl && createPortal(headerControls, headerSlotEl)}
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* AI reasoning/error — slim bar below header */}
      {(aiError || aiReasoning) && (
        <div className="px-4 py-1.5 border-b shrink-0 text-xs bg-muted/30">
          {aiError && (
            <p className="text-[10px] text-destructive">{aiError}</p>
          )}
          {aiReasoning && (
            <div>
              <button
                type="button"
                onClick={() => setAiReasoningOpen(!aiReasoningOpen)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${aiReasoningOpen ? "rotate-90" : ""}`}
                />
                AI reasoning
              </button>
              {aiReasoningOpen && (
                <p className="text-[10px] text-muted-foreground mt-1 pl-4 whitespace-pre-wrap max-h-20 overflow-auto">
                  {aiReasoning}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview — fills remaining space, scrolls independently */}
      <div className="flex-1 overflow-auto px-4 py-4 relative" ref={scrollContainerRef}>
        {renderedSection?.html ? (
          <>
            {activityPreviewMode ? (
              <iframe
                src={`${BASE_URL}/books/${bookLabel}/adt-preview/${pageId}_sec${String(sectionIndex + 1).padStart(3, "0")}.html?embed=1&v=${page.versions.rendering ?? 0}`}
                className="w-full rounded border"
                style={{ height: "80vh" }}
              />
            ) : (
              <BookPreviewFrame
                ref={previewFrameRef}
                html={renderedSection.html}
                className="w-full rounded border"
                editable={!aiLoading && !rerendering}
                prunedDataIds={prunedDataIds}
                changedElements={changedElements}
                onSelectElement={handleSelectElement}
                onTextChanged={handleTextChanged}
                applyBodyBackground={applyBodyBackground}
              />
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center mb-3">
              <LayoutGrid className="w-6 h-6 text-violet-300" />
            </div>
            <p className="text-sm font-medium">No rendered content for this section</p>
            <p className="text-xs mt-1">This section has no storyboard rendering yet</p>
          </div>
        )}

        {/* Pruned section overlay */}
        {section.isPruned && !aiLoading && !rerendering && (
          <div className="absolute inset-0 z-30 bg-background/60 backdrop-blur-[1px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center max-w-xs">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <EyeOff className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Section pruned from flow</p>
              <button
                type="button"
                onClick={toggleSectionPruned}
                className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
              >
                Restore
              </button>
            </div>
          </div>
        )}

        {/* AI loading overlay — blocks all interaction during HTML edit */}
        {aiLoading && (
          <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-[2px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-5 text-center max-w-xs">
              {/* Bouncing dots */}
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-bounce [animation-delay:0ms]" />
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-2.5 h-2.5 rounded-full bg-purple-300 animate-bounce [animation-delay:300ms]" />
              </div>
              <p className="text-sm font-medium text-foreground animate-pulse">
                {AI_MESSAGES[aiMessageIdx]}
              </p>
              <button
                type="button"
                onClick={() => aiAbortRef.current?.abort()}
                className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Re-rendering overlay — shown while reRenderPage is running after a sectioning save */}
        {rerendering && !saving && (
          <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-[2px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-5 text-center max-w-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20 animate-bounce [animation-delay:300ms]" />
              </div>
              <p className="text-sm font-medium text-foreground animate-pulse">
                Re-rendering page...
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Background image generation indicator — absolute to outer panel so it stays visible while scrolling */}
      {aiImageGen && (
        <div className="absolute top-3 right-3 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`flex items-center gap-2 rounded-full px-3.5 py-2 shadow-lg text-white text-xs font-medium ${
              aiImageGen.status === "generating"
                ? "bg-purple-600"
                : aiImageGen.status === "done"
                  ? "bg-green-600"
                  : "bg-destructive"
            }`}
          >
            {aiImageGen.status === "generating" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Generating image...</span>
                <button
                  type="button"
                  onClick={() => {
                    aiImageAbortRef.current?.abort()
                    setAiImageGen(null)
                  }}
                  className="p-0.5 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
            {aiImageGen.status === "done" && (
              <>
                <Sparkles className="h-3 w-3" />
                <span>Image generated</span>
              </>
            )}
            {aiImageGen.status === "error" && (
              <>
                <span>{aiImageGen.error ?? "Generation failed"}</span>
                <button
                  type="button"
                  onClick={() => setAiImageGen(null)}
                  className="p-0.5 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Activity preview toggle — absolute on outer wrapper, sits left of the debug console button */}
      {section.sectionType.startsWith("activity_") && renderedSection?.html && (
        <div className="absolute bottom-4 right-16 z-30 flex items-center gap-2">
          {activityPreviewMode && renderingDirty && (
            <span className="text-[10px] text-amber-600 bg-white/90 px-2 py-1 rounded shadow-sm">
              Save changes first to preview the latest version
            </span>
          )}
          <button
            type="button"
            onClick={() => setActivityPreviewMode((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-md border border-blue-200 transition-colors cursor-pointer opacity-80 hover:opacity-100"
          >
            {activityPreviewMode ? (
              <><PenLine className="h-3 w-3" />Back to Editor</>
            ) : (
              <><Play className="h-3 w-3" />Try Activity</>
            )}
          </button>
        </div>
      )}

      {/* Floating save/discard bar */}
      {(dirty || renderingDirty) && !saving && (
        <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
            <span className="text-sm text-muted-foreground">
              Unsaved:{" "}
              <span className="font-medium text-foreground">
                {[dirty && "sections", renderingDirty && "rendering"].filter(Boolean).join(", ")}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (pendingRendering) await saveRendering()
                  else if (pendingSectioning) await saveSectioning()
                }}
                className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-colors"
              >
                <Save className="h-3 w-3" />
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingSectioning(null)
                  setPendingRendering(null)
                  setAiReasoning(null)
                }}
                className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
              >
                <X className="h-3 w-3" />
                Discard
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Floating popover for selected element */}
      {selectedElement && selectedInfo && (
        <SectionEditToolbar
          dataId={selectedElement.dataId}
          rect={selectedElement.rect}
          containerOffset={{ top: selectedElement.iframeTop, left: selectedElement.iframeLeft }}
          isImage={selectedInfo.isImage}
          textType={selectedInfo.textType}
          isPruned={selectedInfo.isPruned}
          textTypes={textTypes}
          imageSrc={selectedInfo.imageSrc}
          onChangeTextType={handleToolbarChangeTextType}
          onTogglePrune={handleToolbarPrune}
          onCrop={selectedInfo.isImage ? (dataId) => setCropTarget(dataId) : undefined}
          onReplace={selectedInfo.isImage ? handleImageReplace : undefined}
          onAiImage={selectedInfo.isImage && hasApiKey ? handleAiImage : undefined}
          onSegment={selectedInfo.isImage && hasApiKey ? handleSegment : undefined}
          segmenting={segmenting}
        />
      )}

      {/* Slide-out section data panel */}
      <div
        className={`absolute top-0 right-0 h-full w-[480px] bg-background border-l shadow-lg transition-transform duration-200 ease-in-out z-30 ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wider">Content</span>
          {sectionTypes ? (
            <Select value={section.sectionType} onValueChange={changeSectionType}>
              <SelectTrigger className="h-6 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[80px] border-0 bg-muted/50">
                <SelectValue>{section.sectionType}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sectionTypes).map(([key, desc]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {key}
                    <span className="ml-1 text-muted-foreground text-[10px]">{desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-medium">{section.sectionType}</span>
          )}
          {!section.isPruned && (
            <>
              <span
                className="w-3.5 h-3.5 rounded border"
                style={{ backgroundColor: section.backgroundColor }}
                title={`Background: ${section.backgroundColor}`}
              />
              <span
                className="w-3.5 h-3.5 rounded border"
                style={{ backgroundColor: section.textColor }}
                title={`Text color: ${section.textColor}`}
              />
            </>
          )}
          {section.isPruned && (
            <span className="text-destructive text-[10px] font-medium">(pruned)</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCloneSection}
            disabled={cloning || dirty || renderingDirty || saving}
            className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            title={dirty || renderingDirty ? "Save changes before cloning" : "Clone this section"}
          >
            {cloning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <VersionPicker
            currentVersion={page.versions.sectioning}
            saving={saving}
            dirty={dirty}
            bookLabel={bookLabel}
            node="page-sectioning"
            itemId={pageId}
            onPreview={(data) => {
              const s = data as SectioningData
              setPendingSectioning(s)
              if (s.sections && sectionIndex >= s.sections.length) {
                onNavigateSection?.(Math.max(0, s.sections.length - 1))
              }
            }}
            onSave={saveSectioning}
            onDiscard={discardSectioning}
          />
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          </div>
        </div>

        {/* Panel body — scrollable */}
        <div className="overflow-auto h-[calc(100%-41px)] px-4 py-3 space-y-5">
          {/* Text groups */}
          {hasTextParts && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                <Layers className="h-3 w-3" />
                Text Groups
              </h3>
              <div className="space-y-3">
                {parts.map((p, partIndex) => {
                  if (p.type !== "text_group") return null
                  return (
                    <div key={p.groupId} className={`rounded border overflow-hidden transition-opacity duration-300 ${p.isPruned ? "opacity-40" : ""}`}>
                      <div className="px-3 py-1.5 bg-muted/50 border-b flex items-center gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p.groupType}</span>
                        <button
                          type="button"
                          onClick={() => togglePartPruned(partIndex)}
                          className="ml-auto p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
                          title={p.isPruned ? "Include in render" : "Exclude from render"}
                        >
                          {p.isPruned ? (
                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Eye className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      <div className="divide-y">
                        {p.texts.map((t, i) => (
                          <div key={i} className={`px-3 py-1.5 flex items-start gap-2 text-sm transition-opacity duration-300 ${t.isPruned ? "opacity-40" : ""}`}>
                            {textTypes ? (
                              <Select
                                value={t.textType}
                                onValueChange={(val) => changeTextType(partIndex, i, val)}
                              >
                                <SelectTrigger className="shrink-0 h-5 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[60px] border-0 bg-muted/50">
                                  <SelectValue>{t.textType}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(textTypes).map(([key, desc]) => (
                                    <SelectItem key={key} value={key} className="text-xs">
                                      {key}
                                      <span className="ml-1 text-muted-foreground text-[10px]">{desc}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 text-center">
                                {t.textType}
                              </span>
                            )}
                            <span className="leading-relaxed flex-1 min-w-0 text-xs">
                              {t.text}
                            </span>
                            {t.isPruned && (
                              <EyeOff className="shrink-0 self-center h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Images */}
          {hasImageParts && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Images
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {parts.map((p, partIndex) => {
                  if (p.type !== "image") return null
                  return (
                    <div key={p.imageId} className="group relative">
                      <ImageCard
                        imageId={p.imageId}
                        bookLabel={bookLabel}
                        isPruned={p.isPruned}
                        reason={p.reason}
                      />
                      <button
                        type="button"
                        onClick={() => togglePartPruned(partIndex)}
                        className="absolute top-1 right-1 p-1 rounded bg-background/80 hover:bg-accent transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                        title={p.isPruned ? "Include in render" : "Exclude from render"}
                      >
                        {p.isPruned ? (
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Hidden file input for image replace */}
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleImageUpload}
    />

    {/* Image crop dialog */}
    {cropTarget && (
      <ImageCropDialog
        imageSrc={`${BASE_URL}/books/${bookLabel}/images/${cropTarget}`}
        onApply={handleCropApply}
        onClose={() => setCropTarget(null)}
      />
    )}

    {/* AI image prompt dialog */}
    {aiImageDialogTarget && (
      <AiImageDialog
        currentImageSrc={`${BASE_URL}/books/${bookLabel}/images/${aiImageDialogTarget}`}
        imageId={aiImageDialogTarget}
        onSubmit={handleAiImageSubmit}
        onClose={() => setAiImageDialogTarget(null)}
      />
    )}

    {/* Segment preview dialog */}
    {segmentPreview && (
      <SegmentPreviewDialog
        imageSrc={segmentPreview.imageSrc}
        imageWidth={segmentPreview.imageWidth}
        imageHeight={segmentPreview.imageHeight}
        regions={segmentPreview.regions}
        onApply={handleSegmentApply}
        onClose={() => setSegmentPreview(null)}
      />
    )}
    </>
  )
}
