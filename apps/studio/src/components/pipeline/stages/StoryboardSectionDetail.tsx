import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, Eye, EyeOff, LayoutGrid, Loader2, ChevronDown, Sparkles, ChevronRight, PanelRightOpen, PanelRightClose, Play, PenLine, Save, Merge, X } from "lucide-react"
import { SectionDataPanel } from "./SectionDataPanel"
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
import { AddImageDialog } from "./AddImageDialog"
import { SegmentPreviewDialog, type SegmentRegion } from "./SegmentPreviewDialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

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
  const [merging, setMerging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(false)
  const [pendingSectioning, setPendingSectioning] = useState<SectioningData | null>(null)
  const [pendingRendering, setPendingRendering] = useState<RenderingData | null>(null)
  // Tracks whether pending sectioning changes require LLM re-render on save.
  // Pure prune/delete can be resolved locally; unprune/type change/reorder need LLM.
  const needsRerenderRef = useRef(false)

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

  // Add image dialog state
  const [addImageDialogOpen, setAddImageDialogOpen] = useState(false)
  const [showPrunedImages, setShowPrunedImages] = useState(true)

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
  const groupTypes = configQuery.data?.merged?.text_group_types as Record<string, string> | undefined
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
    setAddImageDialogOpen(false)
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
    needsRerenderRef.current = false
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

  // Parts are inline in the section data (empty if section missing — hooks still run)
  const parts = section?.parts ?? []

  // Save / discard sectioning
  const saveSectioning = async () => {
    if (!pendingSectioning) return
    setSaving(true)
    setPanelOpen(false)
    const shouldRerender = needsRerenderRef.current
    try {
      const minDelay = new Promise((r) => setTimeout(r, 400))

      // Before saving, strip pruned elements from the rendered HTML so they
      // disappear from the preview without needing an LLM re-render.
      let renderingFromPrune: RenderingData | null = null
      const sectionToSave = pendingSectioning.sections[sectionIndex]
      if (sectionToSave) {
        const prunedIds: string[] = []
        for (const p of sectionToSave.parts ?? []) {
          if (p.type === "image" && p.isPruned) {
            prunedIds.push(p.imageId)
          } else if (p.type === "text_group") {
            const actualIds = resolveGroupDataIds(p.groupId)
            if (p.isPruned) {
              prunedIds.push(...actualIds)
            } else {
              p.texts.forEach((t, ti) => {
                if (t.isPruned && actualIds[ti]) {
                  prunedIds.push(actualIds[ti])
                }
              })
            }
          }
        }
        if (prunedIds.length > 0) {
          renderingFromPrune = removeElementsFromRendering(prunedIds)
        }
      }

      await api.updateSectioning(bookLabel, pageId, pendingSectioning)

      // Save rendering if dirty (from delete/prune removing HTML elements).
      // Use renderingFromPrune if we just stripped pruned elements above,
      // since React state won't have updated yet within this async call.
      const renderingToSave = renderingFromPrune ?? pendingRendering
      if (renderingToSave) {
        await api.updateRendering(bookLabel, pageId, renderingToSave)
      }

      setPendingSectioning(null)
      setPendingRendering(null)
      setAiReasoning(null)
      needsRerenderRef.current = false
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await minDelay

      // Only re-render when changes require LLM (e.g., unprune, type change, reorder)
      // Skip for pure prune/delete — those are already handled by local HTML removal
      if (shouldRerender && hasApiKey) {
        setRerendering(true)
        const capturedPageId = pageId
        api.reRenderPage(bookLabel, pageId, apiKey, sectionIndex)
          .then(() => {
            if (pageIdRef.current !== capturedPageId) return
            queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", capturedPageId] })
            queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
          })
          .catch(() => {})
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
    needsRerenderRef.current = false
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

  // Merge current section with next or previous
  const handleMergeSection = async (direction: "next" | "prev") => {
    if (merging || dirty || renderingDirty || saving) return
    setMerging(true)
    try {
      const result = await api.mergeSection(bookLabel, pageId, sectionIndex, direction)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      onNavigateSection?.(result.mergedSectionIndex)

      // Auto re-render the merged section so the LLM generates proper HTML for the combined content
      if (hasApiKey) {
        setRerendering(true)
        const capturedPageId = pageId
        api.reRenderPage(bookLabel, pageId, apiKey, result.mergedSectionIndex)
          .then(() => {
            if (pageIdRef.current !== capturedPageId) return
            queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", capturedPageId] })
            queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
          })
          .catch(() => {})
          .finally(() => {
            if (pageIdRef.current === capturedPageId) {
              setRerendering(false)
            }
          })
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Merge failed")
    } finally {
      setMerging(false)
    }
  }

  // Delete current section
  const handleDeleteSection = () => {
    if (deleting || dirty || renderingDirty || saving) return
    setConfirmDeleteSection(true)
  }

  const confirmAndDeleteSection = async () => {
    setConfirmDeleteSection(false)
    setDeleting(true)
    try {
      const result = await api.deleteSection(bookLabel, pageId, sectionIndex)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      onNavigateSection?.(Math.max(0, Math.min(sectionIndex, result.remainingSections - 1)))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  // Manually trigger a re-render of the current section
  const handleRerender = (prompt?: string) => {
    if (rerendering || dirty || renderingDirty || saving || !hasApiKey) return
    setRerendering(true)
    setPanelOpen(false)
    const capturedPageId = pageId
    api.reRenderPage(bookLabel, pageId, apiKey, sectionIndex, prompt)
      .then(() => {
        if (pageIdRef.current !== capturedPageId) return
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", capturedPageId] })
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      })
      .catch((err) => {
        if (pageIdRef.current === capturedPageId) {
          setAiError(err instanceof Error ? err.message : "Re-render failed")
        }
      })
      .finally(() => {
        if (pageIdRef.current === capturedPageId) {
          setRerendering(false)
        }
      })
  }

  // Resolve the actual data-ids for a text group's elements from the current rendering HTML.
  // Returns data-ids in document order, which stays in sync with the sectioning texts array
  // even after local edits (delete/duplicate) that shift positional indices.
  const resolveGroupDataIds = useCallback(
    (groupId: string): string[] => {
      const rBase = pendingRendering ?? page.rendering
      if (!rBase) return []
      const currentSection = getRenderedSectionByIndex(rBase, sectionIndex)
      if (!currentSection?.html) return []
      const parser = new DOMParser()
      const doc = parser.parseFromString(currentSection.html, "text/html")
      const elements = doc.querySelectorAll(`[data-id^="${groupId}_tx"]`)
      return Array.from(elements).map(el => el.getAttribute("data-id")!).filter(Boolean)
    },
    [pendingRendering, page.rendering, sectionIndex]
  )

  // Remove one or more data-id elements from the rendered HTML and update pendingRendering.
  // Returns the updated rendering, or null if nothing changed.
  const removeElementsFromRendering = useCallback(
    (dataIds: string[]): RenderingData | null => {
      const rBase = pendingRendering ?? page.rendering
      if (!rBase) return null
      const currentSection = getRenderedSectionByIndex(rBase, sectionIndex)
      if (!currentSection?.html) return null

      const parser = new DOMParser()
      const doc = parser.parseFromString(currentSection.html, "text/html")
      let removed = false

      for (const dataId of dataIds) {
        const el = doc.querySelector(`[data-id="${dataId}"]`)
        if (!el) continue

        const blockParent = el.closest("div, p, figure, li, tr, section[data-section-id]")
        if (blockParent && blockParent.getAttribute("data-section-id")) {
          el.remove()
        } else if (blockParent && blockParent.querySelectorAll("[data-id]").length <= 1) {
          blockParent.remove()
        } else {
          el.remove()
        }
        removed = true
      }

      if (!removed) return null

      const newHtml = doc.querySelector("section[data-section-id]")?.outerHTML ?? doc.body.innerHTML
      const updated: RenderingData = {
        ...rBase,
        sections: rBase.sections.map((s) => {
          if (s.sectionIndex !== sectionIndex) return s
          return { ...s, html: newHtml }
        }),
      }
      setPendingRendering(updated)
      return updated
    },
    [pendingRendering, page.rendering, sectionIndex]
  )

  // Clone data-id elements in the rendered HTML and insert after the originals.
  // `mappings` is an array of { sourceDataId, newDataId } pairs.
  // For group duplication, pass all text entries of the source group mapped to new IDs.
  const duplicateElementsInRendering = useCallback(
    (mappings: Array<{ sourceDataId: string; newDataId: string }>) => {
      const rBase = pendingRendering ?? page.rendering
      if (!rBase) return
      const currentSection = getRenderedSectionByIndex(rBase, sectionIndex)
      if (!currentSection?.html) return

      const parser = new DOMParser()
      const doc = parser.parseFromString(currentSection.html, "text/html")

      // Resolve each source element's block-level target (the node we insert after)
      function getBlockTarget(el: Element): Element {
        const blockParent = el.closest("div, p, figure, li, tr")
        return blockParent && !blockParent.getAttribute("data-section-id") ? blockParent : el
      }

      // Find the last source element to use as insertion anchor — all clones go after it
      // so duplicated groups appear together rather than interleaved with originals.
      let lastTarget: Element | null = null
      const clones: Element[] = []

      for (const { sourceDataId, newDataId } of mappings) {
        const el = doc.querySelector(`[data-id="${sourceDataId}"]`)
        if (!el) continue

        const clone = el.cloneNode(true) as Element
        clone.setAttribute("data-id", newDataId)

        const target = getBlockTarget(el)
        lastTarget = target

        // Wrap clone in block parent copy if source was wrapped
        if (target !== el) {
          const bp = target.cloneNode(false) as Element
          bp.appendChild(clone)
          clones.push(bp)
        } else {
          clones.push(clone)
        }
      }

      if (!lastTarget || clones.length === 0) return

      // Insert all clones after the last source element's block target
      const insertionRef = lastTarget.nextSibling
      const parent = lastTarget.parentNode
      for (const c of clones) {
        parent?.insertBefore(c, insertionRef)
      }

      const newHtml = doc.querySelector("section[data-section-id]")?.outerHTML ?? doc.body.innerHTML
      const updated: RenderingData = {
        ...rBase,
        sections: rBase.sections.map((s) => {
          if (s.sectionIndex !== sectionIndex) return s
          return { ...s, html: newHtml }
        }),
      }
      setPendingRendering(updated)
    },
    [pendingRendering, page.rendering, sectionIndex]
  )

  // Delete selected block from rendered HTML
  const handleDeleteBlock = useCallback(
    (dataId: string) => {
      removeElementsFromRendering([dataId])

      // Also delete matching part from sectioning (not just prune)
      const sBase = pendingSectioning ?? page.sectioning
      if (sBase) {
        const loc = findTextByDataId(parts, dataId)
        if (loc) {
          const updatedSectioning: SectioningData = {
            ...sBase,
            sections: sBase.sections.map((s, si) => {
              if (si !== sectionIndex) return s
              return {
                ...s,
                parts: s.parts.map((p, pi) => {
                  if (pi !== loc.partIndex || p.type !== "text_group") return p
                  return {
                    ...p,
                    texts: p.texts.filter((_, ti) => ti !== loc.textIndex),
                  }
                }),
              }
            }),
          }
          setPendingSectioning(updatedSectioning)
        } else {
          // Image — filter out entirely
          const imgIdx = parts.findIndex((p) => p.type === "image" && p.imageId === dataId)
          if (imgIdx >= 0) {
            const updatedSectioning: SectioningData = {
              ...sBase,
              sections: sBase.sections.map((s, si) => {
                if (si !== sectionIndex) return s
                return {
                  ...s,
                  parts: s.parts.filter((_, pi) => pi !== imgIdx),
                }
              }),
            }
            setPendingSectioning(updatedSectioning)
          }
        }
      }

      setSelectedElement(null)
    },
    [removeElementsFromRendering, pendingSectioning, page.sectioning, sectionIndex, parts]
  )

  // Toggle isPruned on a part within the current section
  const togglePartPruned = (partIndex: number) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    // Unpruning requires re-render to add the element back to HTML
    const currentPart = base.sections[sectionIndex]?.parts[partIndex]
    if (currentPart?.isPruned) needsRerenderRef.current = true
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
    // Unpruning requires re-render
    if (base.sections[sectionIndex]?.isPruned) needsRerenderRef.current = true
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
    needsRerenderRef.current = true
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
    needsRerenderRef.current = true
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

  // Change group type for a specific text group
  const changeGroupType = (partIndex: number, newType: string) => {
    needsRerenderRef.current = true
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
            return { ...p, groupType: newType }
          }),
        }
      }),
    }
    setPendingSectioning(updated)
  }

  // Toggle isPruned on a specific text entry
  const toggleTextPruned = (partIndex: number, textIndex: number) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    // Unpruning requires re-render to add the element back
    const part = base.sections[sectionIndex]?.parts[partIndex]
    if (part?.type === "text_group" && part.texts[textIndex]?.isPruned) {
      needsRerenderRef.current = true
    }
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
                return { ...t, isPruned: !t.isPruned }
              }),
            }
          }),
        }
      }),
    }
    setPendingSectioning(updated)
  }

  // Delete a specific text entry from a group (removes from sectioning + preview HTML)
  const deleteTextEntry = (partIndex: number, textIndex: number) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    // Resolve the actual data-id from the HTML before removing from sectioning
    const part = parts[partIndex]
    if (part?.type === "text_group") {
      const actualIds = resolveGroupDataIds(part.groupId)
      const dataId = actualIds[textIndex]
      if (dataId) removeElementsFromRendering([dataId])
    }
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
              texts: p.texts.filter((_, ti) => ti !== textIndex),
            }
          }),
        }
      }),
    }
    setPendingSectioning(updated)
  }

  // Duplicate a specific text entry within a group
  const duplicateTextEntry = (partIndex: number, textIndex: number) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const part = parts[partIndex]
    if (!part || part.type !== "text_group") return
    const newTextId = `user_txt_${crypto.randomUUID().slice(0, 8)}`
    const actualIds = resolveGroupDataIds(part.groupId)
    const sourceDataId = actualIds[textIndex]
    const newDataId = `${part.groupId}_tx_${crypto.randomUUID().slice(0, 8)}`
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        return {
          ...s,
          parts: s.parts.map((p, pi) => {
            if (pi !== partIndex || p.type !== "text_group") return p
            const newTexts = [...p.texts]
            const cloned = { ...p.texts[textIndex], textId: newTextId }
            newTexts.splice(textIndex + 1, 0, cloned)
            return { ...p, texts: newTexts }
          }),
        }
      }),
    }
    setPendingSectioning(updated)
    // Clone the element in the preview HTML
    if (sourceDataId) {
      duplicateElementsInRendering([{ sourceDataId, newDataId }])
    }
  }

  // Add a new empty text group
  const addGroup = () => {
    needsRerenderRef.current = true
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const newGroup = {
      type: "text_group" as const,
      groupId: `user_grp_${crypto.randomUUID().slice(0, 8)}`,
      groupType: "body",
      texts: [] as { textId: string; textType: string; text: string; isPruned: boolean }[],

      isPruned: false,
    }
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        return { ...s, parts: [...s.parts, newGroup] }
      }),
    }
    setPendingSectioning(updated)
  }

  // Duplicate a text group
  const duplicateGroup = (partIndex: number) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const srcPart = parts[partIndex]
    if (!srcPart || srcPart.type !== "text_group") return
    const newGroupId = `user_grp_${crypto.randomUUID().slice(0, 8)}`
    // Build mappings from actual HTML data-ids to new data-ids for the preview clone
    const actualSourceIds = resolveGroupDataIds(srcPart.groupId)
    const mappings = actualSourceIds.map((sourceDataId, ti) => ({
      sourceDataId,
      newDataId: `${newGroupId}_tx${String(ti + 1).padStart(3, "0")}`,
    }))
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        const cloned = structuredClone(srcPart)
        const clone = {
          ...cloned,
          groupId: newGroupId,
          texts: cloned.texts.map((t: { textId: string; textType: string; text: string; isPruned: boolean }) => ({
            ...t,
            textId: `user_txt_${crypto.randomUUID().slice(0, 8)}`,
          })),
        }
        const newParts = [...s.parts]
        newParts.splice(partIndex + 1, 0, clone)
        return { ...s, parts: newParts }
      }),
    }
    setPendingSectioning(updated)
    // Clone the elements in the preview HTML
    duplicateElementsInRendering(mappings)
  }

  // Delete a text group (removes from sectioning + preview HTML)
  const deleteGroup = (partIndex: number) => {
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    // Remove all text elements belonging to this group from the preview
    const part = parts[partIndex]
    if (part?.type === "text_group") {
      const dataIds = resolveGroupDataIds(part.groupId)
      if (dataIds.length > 0) removeElementsFromRendering(dataIds)
    }
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        return { ...s, parts: s.parts.filter((_, pi) => pi !== partIndex) }
      }),
    }
    setPendingSectioning(updated)
  }

  // Reorder parts within the section
  const reorderParts = (fromIndex: number, toIndex: number) => {
    needsRerenderRef.current = true
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        const newParts = [...s.parts]
        const [moved] = newParts.splice(fromIndex, 1)
        newParts.splice(toIndex, 0, moved)
        return { ...s, parts: newParts }
      }),
    }
    setPendingSectioning(updated)
  }

  // Move a text entry between groups (or reorder within a group)
  const moveText = (
    fromPartIndex: number,
    fromTextIndex: number,
    toPartIndex: number,
    toTextIndex: number
  ) => {
    needsRerenderRef.current = true
    const base = pendingSectioning ?? page.sectioning
    if (!base) return
    const updated: SectioningData = {
      ...base,
      sections: base.sections.map((s, si) => {
        if (si !== sectionIndex) return s
        const fromGroup = s.parts[fromPartIndex]
        const toGroup = s.parts[toPartIndex]
        if (fromGroup?.type !== "text_group" || toGroup?.type !== "text_group") return s

        if (fromPartIndex === toPartIndex) {
          // Reorder within the same group
          const texts = [...fromGroup.texts]
          const [moved] = texts.splice(fromTextIndex, 1)
          texts.splice(toTextIndex > fromTextIndex ? toTextIndex - 1 : toTextIndex, 0, moved)
          return {
            ...s,
            parts: s.parts.map((p, pi) => {
              if (pi !== fromPartIndex) return p
              return { ...p, texts }
            }),
          }
        }

        // Move between different groups
        const movedText = fromGroup.texts[fromTextIndex]
        return {
          ...s,
          parts: s.parts.map((p, pi) => {
            if (p.type !== "text_group") return p
            if (pi === fromPartIndex) {
              return { ...p, texts: p.texts.filter((_, ti) => ti !== fromTextIndex) }
            }
            if (pi === toPartIndex) {
              const newTexts = [...p.texts]
              newTexts.splice(toTextIndex, 0, movedText)
              return { ...p, texts: newTexts }
            }
            return p
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

  // Add a new image to the current section (append to parts + inject into HTML)
  const addImageToSection = useCallback(
    (newImageId: string, dims?: { w: number; h: number }) => {
      // Update sectioning
      setPendingSectioning((prev) => {
        const sBase = prev ?? pageDataRef.current.sectioning
        if (!sBase) return prev
        return {
          ...sBase,
          sections: sBase.sections.map((s, si) => {
            if (si !== sectionIndex) return s
            // Skip if image already exists in this section
            if (s.parts.some((p) => p.type === "image" && p.imageId === newImageId)) return s
            return {
              ...s,
              parts: [...s.parts, { type: "image" as const, imageId: newImageId, isPruned: false }],
            }
          }),
        }
      })

      // Update rendering HTML — append img tag at end of section content
      setPendingRendering((prev) => {
        const rBase = prev ?? pageDataRef.current.rendering
        if (!rBase) return prev
        const imgTag = `<img data-id="${newImageId}" src="${BASE_URL}/books/${bookLabel}/images/${newImageId}"${dims ? ` width="${dims.w}" height="${dims.h}"` : ""} alt="${newImageId}" class="w-full" />`
        return {
          ...rBase,
          sections: rBase.sections.map((s) => {
            if (s.sectionIndex !== sectionIndex) return s
            // Try to insert before closing </section>, otherwise append
            const closingIdx = s.html.lastIndexOf("</section>")
            const html = closingIdx >= 0
              ? s.html.slice(0, closingIdx) + imgTag + s.html.slice(closingIdx)
              : s.html + imgTag
            return { ...s, html }
          }),
        }
      })
    },
    [bookLabel, sectionIndex]
  )

  // Handlers for AddImageDialog
  const handleAddExistingImage = useCallback(
    (imageIds: string[]) => {
      setAddImageDialogOpen(false)
      for (const id of imageIds) {
        addImageToSection(id)
      }
    },
    [addImageToSection]
  )

  const handleAddImageUpload = useCallback(
    async (file: File) => {
      setAddImageDialogOpen(false)
      try {
        const result = await api.uploadNewImage(bookLabel, pageId, file)
        addImageToSection(result.imageId, { w: result.width, h: result.height })
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "Image upload failed")
      }
    },
    [bookLabel, pageId, addImageToSection]
  )

  const handleAddImageGenerate = useCallback(
    (prompt: string) => {
      setAddImageDialogOpen(false)
      setAiImageGen({ targetImageId: "__adding__", status: "generating" })

      const controller = new AbortController()
      aiImageAbortRef.current = controller

      api
        .aiGenerateImage(bookLabel, pageId, prompt, apiKey, pageId, undefined, controller.signal)
        .then((result) => {
          addImageToSection(result.imageId, { w: result.width, h: result.height })
          setAiImageGen({ targetImageId: "__adding__", status: "done" })
          setTimeout(() => setAiImageGen((prev) => prev?.status === "done" ? null : prev), 3000)
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") {
            setAiImageGen(null)
          } else {
            setAiImageGen({
              targetImageId: "__adding__",
              status: "error",
              error: err instanceof Error ? err.message : "Image generation failed",
            })
          }
        })
        .finally(() => {
          aiImageAbortRef.current = null
        })
    },
    [bookLabel, pageId, apiKey, addImageToSection]
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
          section?.isPruned
            ? "bg-amber-500/30 hover:bg-amber-500/40"
            : "bg-white/10 hover:bg-white/20"
        }`}
        title={section?.isPruned ? "Restore section to flow" : "Prune section from flow"}
      >
        {section?.isPruned ? (
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

  if (!section) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Section not found.
      </div>
    )
  }

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
        {!section ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <LayoutGrid className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">No sections on this page</p>
            <p className="text-xs mt-1">All sections have been deleted</p>
          </div>
        ) : renderedSection?.html ? (
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
                  bookLabel={bookLabel}
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
        {section?.isPruned && !aiLoading && !rerendering && (
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
          onDelete={handleDeleteBlock}
        />
      )}

      {/* Slide-out section data panel */}
      {section && (
      <SectionDataPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        section={section}
        sectionIndex={sectionIndex}
        sectionCount={sectioningData?.sections.length ?? 0}
        bookLabel={bookLabel}
        sectionTypes={sectionTypes}
        textTypes={textTypes}
        groupTypes={groupTypes}
        onChangeSectionType={changeSectionType}
        onToggleSectionPruned={toggleSectionPruned}
        onTogglePartPruned={togglePartPruned}
        onChangeGroupType={changeGroupType}
        onChangeTextType={changeTextType}
        onToggleTextPruned={toggleTextPruned}
        onDeleteTextEntry={deleteTextEntry}
        onDuplicateTextEntry={duplicateTextEntry}
        onAddGroup={addGroup}
        onDuplicateGroup={duplicateGroup}
        onDeleteGroup={deleteGroup}
        onReorderParts={reorderParts}
        onMoveText={moveText}
        onMergeSection={handleMergeSection}
        onCloneSection={handleCloneSection}
        onDeleteSection={handleDeleteSection}
        onRerender={handleRerender}
        onAddImage={() => setAddImageDialogOpen(true)}
        versionPickerNode={
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
        }
        merging={merging}
        cloning={cloning}
        deleting={deleting}
        saving={saving}
        rerendering={rerendering}
        dirty={dirty}
        renderingDirty={renderingDirty}
        hasApiKey={hasApiKey}
        showPrunedImages={showPrunedImages}
        onToggleShowPrunedImages={() => setShowPrunedImages((v) => !v)}
      />
      )}
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

    {/* Add image dialog */}
    {addImageDialogOpen && (
      <AddImageDialog
        bookLabel={bookLabel}
        onSelectExisting={handleAddExistingImage}
        onUpload={handleAddImageUpload}
        onGenerate={handleAddImageGenerate}
        onClose={() => setAddImageDialogOpen(false)}
      />
    )}

    {/* Delete section confirmation dialog */}
    <Dialog open={confirmDeleteSection} onOpenChange={setConfirmDeleteSection}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete section</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this section? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => setConfirmDeleteSection(false)}
            className="px-3 py-1.5 text-sm rounded border hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmAndDeleteSection}
            className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
