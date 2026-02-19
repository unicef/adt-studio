import { useState, useEffect, useRef, useCallback, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, Eye, EyeOff, Layers, Loader2, ChevronDown, Sparkles, ChevronRight, PanelRightOpen, PanelRightClose, X } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { PageDetail, VersionEntry } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useStepHeader } from "../StepViewRouter"
import { BookPreviewFrame, type BookPreviewFrameHandle } from "@/components/storyboard/BookPreviewFrame"
import { SectionEditToolbar } from "./SectionEditToolbar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

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
      className={`relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[80px] ${isPruned ? "opacity-40" : ""}`}
      title={isPruned ? `Pruned: ${reason}` : undefined}
    >
      <img
        src={`/api/books/${bookLabel}/images/${imageId}`}
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

// -- Helpers --

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
}: {
  bookLabel: string
  pageId: string
  sectionIndex: number
  page: PageDetail
  /** Page/section label rendered in the purple header */
  navigationExtra?: ReactNode
  /** Prev/next arrow buttons rendered at the far right of the purple header */
  navigationArrows?: ReactNode
}) {
  const queryClient = useQueryClient()
  const { apiKey, hasApiKey } = useApiKey()
  const { headerSlotEl } = useStepHeader()

  const [saving, setSaving] = useState(false)
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

  // Section data panel state
  const [panelOpen, setPanelOpen] = useState(false)

  // AI edit state
  const [aiInstruction, setAiInstruction] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReasoning, setAiReasoning] = useState<string | null>(null)
  const [aiReasoningOpen, setAiReasoningOpen] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // Fetch active config for type dropdowns
  const configQuery = useQuery({
    queryKey: ["books", bookLabel, "config", "active"],
    queryFn: () => api.getActiveConfig(bookLabel),
    staleTime: 5 * 60 * 1000,
  })

  const textTypes = configQuery.data?.merged?.text_types as Record<string, string> | undefined
  const sectionTypes = configQuery.data?.merged?.section_types as Record<string, string> | undefined

  // Clear pending state when page changes
  useEffect(() => {
    setPendingSectioning(null)
    setPendingRendering(null)
    setSelectedElement(null)
    setAiInstruction("")
    setAiReasoning(null)
    setAiError(null)
  }, [pageId])

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
  const renderedSection = renderingData?.sections[sectionIndex]
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
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateSectioning(bookLabel, pageId, pendingSectioning)
    setPendingSectioning(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
    await minDelay
    setSaving(false)

    // Automatically re-render with the updated sectioning
    if (hasApiKey) {
      api.reRenderPage(bookLabel, pageId, apiKey).then(() => {
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      })
    }
  }

  const discardSectioning = () => {
    setPendingSectioning(null)
  }

  // Save rendering (including back-propagation to sectioning)
  const saveRendering = async () => {
    if (!pendingRendering) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))

    // Save the rendering
    await api.updateRendering(bookLabel, pageId, pendingRendering)

    // Back-propagate: if we have sectioning data and edited HTML, update sectioning too
    const editedHtml = pendingRendering.sections[sectionIndex]?.html
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
    setSaving(false)
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
        sections: base.sections.map((s, si) => {
          if (si !== sectionIndex) return s
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

  // AI edit handler
  const handleAiEdit = async () => {
    if (!aiInstruction.trim() || !hasApiKey || aiLoading) return
    setAiLoading(true)
    setAiError(null)
    setAiReasoning(null)

    try {
      // Send current HTML so successive AI edits build on pending changes
      const currentHtml = renderedSection?.html
      const result = await api.aiEditSection(
        bookLabel,
        pageId,
        sectionIndex,
        aiInstruction.trim(),
        apiKey,
        currentHtml
      )

      // Apply the AI edit as pending rendering
      const base = pendingRendering ?? page.rendering
      if (!base) return
      const updated: RenderingData = {
        ...base,
        sections: base.sections.map((s, si) => {
          if (si !== sectionIndex) return s
          return { ...s, html: result.html }
        }),
      }
      setPendingRendering(updated)
      setAiReasoning(result.reasoning)
      setAiInstruction("")
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI edit failed")
    } finally {
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

    return {
      isImage,
      textType: textEntry?.textType,
      isPruned: textEntry?.isPruned ?? false,
    }
  }

  const selectedInfo = selectedElement ? getSelectedElementInfo() : null

  // Check if this section has any text groups or images
  const hasTextParts = parts.some((p) => p.type === "text_group")
  const hasImageParts = parts.some((p) => p.type === "image")

  // Header controls rendered via portal into the purple step header
  const headerControls = (
    <>
      {navigationExtra}
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
            placeholder="Ask AI to edit..."
            disabled={aiLoading}
            className="pl-7 h-7 text-[11px] bg-white border-white/40 text-gray-900 placeholder:text-gray-400 focus-visible:ring-white/50"
          />
          {aiLoading && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
          )}
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
      <div className="flex-1 overflow-auto px-4 py-4" ref={scrollContainerRef}>
        {renderedSection?.html ? (
          <BookPreviewFrame
            ref={previewFrameRef}
            html={renderedSection.html}
            className="w-full rounded border"
            editable
            onSelectElement={handleSelectElement}
            onTextChanged={handleTextChanged}
          />
        ) : (
          <div className="p-4 text-sm text-muted-foreground border rounded">
            No rendered content for this section.
          </div>
        )}
      </div>

      {/* Floating toolbar for selected element */}
      {selectedElement && selectedInfo && (
        <SectionEditToolbar
          dataId={selectedElement.dataId}
          rect={selectedElement.rect}
          containerOffset={{ top: selectedElement.iframeTop, left: selectedElement.iframeLeft }}
          isImage={selectedInfo.isImage}
          textType={selectedInfo.textType}
          isPruned={selectedInfo.isPruned}
          textTypes={textTypes}
          onChangeTextType={handleToolbarChangeTextType}
          onTogglePrune={handleToolbarPrune}
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
                <SelectValue />
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
          <VersionPicker
            currentVersion={page.versions.sectioning}
            saving={saving}
            dirty={dirty}
            bookLabel={bookLabel}
            node="page-sectioning"
            itemId={pageId}
            onPreview={(data) => setPendingSectioning(data as SectioningData)}
            onSave={saveSectioning}
            onDiscard={discardSectioning}
          />
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="ml-auto p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
                    <div key={p.groupId} className={`rounded border overflow-hidden transition-opacity ${p.isPruned ? "opacity-40" : ""}`}>
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
                          <div key={i} className={`px-3 py-1.5 flex items-start gap-2 text-sm ${t.isPruned ? "opacity-40" : ""}`}>
                            {textTypes ? (
                              <Select
                                value={t.textType}
                                onValueChange={(val) => changeTextType(partIndex, i, val)}
                              >
                                <SelectTrigger className="shrink-0 h-5 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[60px] border-0 bg-muted/50">
                                  <SelectValue />
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
    </>
  )
}
