import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  Boxes,
  Code,
  Eye,
  EyeOff,
  GripHorizontal,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Play,
  Sparkles,
  Type,
  X,
} from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, BASE_URL } from "@/api/client"
import type { PageDetail } from "@/api/client"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import type {
  ContentNodeData,
  PageSectioningOutput,
  PageSectioningSection,
} from "@adt/types"
import {
  addImageLeaf,
  collectLeafNodes,
  collectPrunedLeafIds,
  deleteNode,
  editLeafText,
  findNode,
  replaceNodeId,
  setLeafRole,
  toggleNodePruned,
} from "@adt/types"
import { useApiKey } from "@/hooks/use-api-key"
import { useActiveConfig } from "@/hooks/use-debug"
import { usePage } from "@/hooks/use-pages"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { useBookRun } from "@/hooks/use-book-run"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { useStepHeader } from "../../../components/StepViewRouter"
import { LoadingState } from "../../../components/LoadingState"
import { StageEmptyState } from "../../../components/StageEmptyState"
import { useFloatingSave, PendingChip } from "../../../components/floating-save"
import {
  BookPreviewFrame,
  type BookPreviewFrameHandle,
  type ComputedTypographyStyles,
} from "./BookPreviewFrame"
import { SectionEditPanel } from "./SectionEditPanel"
import { StorySectionBanner } from "./StorySectionBanner"
import { Puzzle } from "lucide-react"
import { StyleEditorPanel } from "./style-editor"
import { ViewportToggle } from "./style-editor/ViewportToggle"
import {
  DEVICE_WIDTHS,
  useDeviceView,
} from "./style-editor/device-breakpoint"
import { ImageCropDialog } from "./ImageCropDialog"
import { AiImageDialog } from "./AiImageDialog"
import { AddImageDialog } from "./AddImageDialog"
import { ReplaceFromBookDialog } from "./ReplaceFromBookDialog"
import { SegmentPreviewDialog, type SegmentRegion } from "./SegmentPreviewDialog"
import { AiEditHistoryDrawer } from "./AiEditHistoryDrawer"
import { Input } from "@/components/ui/input"
import { useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n } from "@lingui/core"
import { getSectionTypeLabel } from "@/lib/section-constants"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

const TEXT_LIKE_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "span", "em", "strong", "i", "b", "u", "s",
  "code", "kbd", "samp", "sub", "sup",
  "blockquote", "figcaption", "small", "mark", "cite",
])

// Image src format embedded in stored rendering HTML — must match the pipeline's
// web-rendering.ts `imageUrlFor`. Always relative so the iframe's <base> resolves it.
// Don't use BASE_URL here: in Electron BASE_URL is absolute (http://localhost:<port>/api),
// which won't match the relative URLs the pipeline writes into the HTML and causes
// crop / replace / segment / AI-image swaps to silently leave the old src in place.
function renderedImageSrc(label: string, imageId: string): string {
  return `/api/books/${label}/images/${imageId}`
}

// -- AI loading messages --

const AI_MESSAGE_DESCRIPTORS = [
  msg`Rewriting the story of this section...`,
  msg`Teaching the pixels new tricks...`,
  msg`Asking the AI to put on its creative hat...`,
  msg`Rearranging atoms of HTML...`,
  msg`Consulting the style council...`,
  msg`Sprinkling some digital fairy dust...`,
  msg`The AI is having a think...`,
  msg`Brewing a fresh batch of HTML...`,
  msg`Polishing paragraphs to perfection...`,
  msg`Untangling nested divs with care...`,
]

function getAiMessages() {
  return AI_MESSAGE_DESCRIPTORS.map((d) => i18n._(d))
}

// -- Types --

type SectioningData = PageSectioningOutput
type RenderingData = NonNullable<PageDetail["rendering"]>

// `_el#` data-ids are assigned by the iframe at runtime to give the inspector
// a stable handle on container elements; they must not be persisted.
function stripTransientIds(rendering: RenderingData): RenderingData {
  return {
    ...rendering,
    sections: rendering.sections.map((s) => ({
      ...s,
      html: s.html.replace(/\s+data-id="_el\d+"/g, ""),
    })),
  }
}

// Replace the section at index `sectionIndex` with the given section, producing
// a new PageSectioningOutput.
function replaceSection(
  sectioning: SectioningData,
  sectionIndex: number,
  next: PageSectioningSection
): SectioningData {
  return {
    ...sectioning,
    sections: sectioning.sections.map((s, i) => (i === sectionIndex ? next : s)),
  }
}

// Replace the tree of the section at `sectionIndex` with `nextNodes`.
function withSectionNodes(
  sectioning: SectioningData,
  sectionIndex: number,
  nextNodes: ContentNodeData[]
): SectioningData {
  return {
    ...sectioning,
    sections: sectioning.sections.map((s, i) =>
      i === sectionIndex ? { ...s, nodes: nextNodes } : s
    ),
  }
}

// Replace a single node (matched by id, anywhere in the tree) with `siblings`
// at the same slot. Used when segmentation produces multiple images from one.
function replaceNodeWithSiblings(
  nodes: ContentNodeData[],
  targetNodeId: string,
  siblings: ContentNodeData[]
): ContentNodeData[] {
  let replaced = false
  const walk = (list: ContentNodeData[]): ContentNodeData[] => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].nodeId === targetNodeId) {
        replaced = true
        return [...list.slice(0, i), ...siblings, ...list.slice(i + 1)]
      }
      const children = list[i].children
      if (children) {
        const nextChildren = walk(children)
        if (nextChildren !== children) {
          return list.map((n, j) =>
            j === i ? { ...n, children: nextChildren } : n
          )
        }
      }
    }
    return list
  }
  const next = walk(nodes)
  return replaced ? next : nodes
}

function getRenderedSectionByIndex(
  rendering: RenderingData | null | undefined,
  sectionIndex: number
) {
  return rendering?.sections.find((s) => s.sectionIndex === sectionIndex)
}

/**
 * Compare pending (edited) HTML against saved (original) HTML and produce
 * structured LLM instructions describing the user's manual edits.
 * Returns an empty string if there are no meaningful differences.
 */
/* eslint-disable lingui/no-unlocalized-strings -- LLM prompt instructions, not user-visible */
function buildEditInstructions(savedHtml: string, pendingHtml: string): string {
  if (savedHtml === pendingHtml) return ""

  const parser = new DOMParser()
  const savedDoc = parser.parseFromString(savedHtml, "text/html")
  const pendingDoc = parser.parseFromString(pendingHtml, "text/html")

  const lines: string[] = []

  // Compare elements with data-id (text + image elements)
  pendingDoc.querySelectorAll("[data-id]").forEach((pendingEl) => {
    const dataId = pendingEl.getAttribute("data-id")
    if (!dataId) return
    const savedEl = savedDoc.querySelector(`[data-id="${dataId}"]`)

    // Class changes
    const pendingClasses = pendingEl.getAttribute("class") ?? ""
    const savedClasses = savedEl?.getAttribute("class") ?? ""
    if (pendingClasses !== savedClasses) {
      const tag = pendingEl.tagName.toLowerCase()
      if (pendingClasses.trim()) {
        lines.push(`- <${tag} data-id="${dataId}"> must use these Tailwind classes: "${pendingClasses}"`)
      } else if (savedClasses.trim()) {
        lines.push(`- <${tag} data-id="${dataId}"> had all classes removed — do NOT add any classes`)
      }
    }

    // Text content changes (non-image elements only)
    if (pendingEl.tagName !== "IMG" && savedEl) {
      const pendingText = pendingEl.textContent?.trim() ?? ""
      const savedText = savedEl.textContent?.trim() ?? ""
      if (pendingText !== savedText && pendingText) {
        lines.push(`- Element [data-id="${dataId}"] text was changed to: "${pendingText}"`)
      }
    }

    // Deleted elements (present in saved but missing in pending)
    // Note: we check saved → pending direction for deletions
  })

  // Check for elements deleted from saved
  savedDoc.querySelectorAll("[data-id]").forEach((savedEl) => {
    const dataId = savedEl.getAttribute("data-id")
    if (!dataId) return
    if (!pendingDoc.querySelector(`[data-id="${dataId}"]`)) {
      lines.push(`- Element [data-id="${dataId}"] was removed — do NOT include it`)
    }
  })

  // Compare structural/container elements (elements without data-id that wrap content)
  // Walk the pending doc and compare parent elements by structure
  const pendingWrapper = pendingDoc.getElementById("content") ?? pendingDoc.body
  const savedWrapper = savedDoc.getElementById("content") ?? savedDoc.body

  // Compare the wrapper class itself
  if (pendingWrapper.getAttribute("class") !== savedWrapper.getAttribute("class")) {
    const cls = pendingWrapper.getAttribute("class")
    if (cls?.trim()) {
      lines.push(`- The wrapper container (id="content") must use classes: "${cls}"`)
    }
  }

  // Compare direct section children class changes
  const pendingSections = pendingWrapper.querySelectorAll("section, [data-section-type]")
  const savedSections = savedWrapper.querySelectorAll("section, [data-section-type]")
  pendingSections.forEach((pSec, i) => {
    const sSec = savedSections[i]
    if (!sSec) return
    const pCls = pSec.getAttribute("class") ?? ""
    const sCls = sSec.getAttribute("class") ?? ""
    if (pCls !== sCls && pCls.trim()) {
      const sectionId = pSec.getAttribute("data-section-id") ?? `index ${i}`
      lines.push(`- The <section> (${sectionId}) must use classes: "${pCls}"`)
    }
  })

  if (lines.length === 0) return ""

  return [
    "IMPORTANT — PRESERVE THESE MANUAL EDITS THE USER MADE:",
    "The user has manually edited the previous rendering. When regenerating, you MUST preserve these specific changes:",
    ...lines,
    "",
    "Apply these edits to the new rendering. The classes and text changes above take priority over your default styling choices.",
  ].join("\n")
}
/* eslint-enable lingui/no-unlocalized-strings */

// -- Helpers --

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Back-propagate text changes from edited HTML into sectioning data.
 * Tree leaves have nodeId === data-id, so we walk every leaf and update its
 * text if the corresponding element in the HTML has changed.
 */
function backPropagateTextChanges(
  sectioning: SectioningData,
  sectionIndex: number,
  fullHtml: string
): SectioningData {
  const parser = new DOMParser()
  const doc = parser.parseFromString(fullHtml, "text/html")
  const textMap = new Map<string, string>()
  doc.querySelectorAll("[data-id]").forEach((el) => {
    const id = el.getAttribute("data-id")
    if (id && el.tagName !== "IMG") {
      textMap.set(id, el.textContent?.trim() ?? "")
    }
  })

  if (textMap.size === 0) return sectioning

  const section = sectioning.sections[sectionIndex]
  if (!section) return sectioning

  let nextNodes = section.nodes
  for (const leaf of collectLeafNodes(section.nodes)) {
    if (leaf.role === "image") continue
    const nextText = textMap.get(leaf.nodeId)
    if (nextText !== undefined && nextText !== (leaf.text ?? "")) {
      nextNodes = editLeafText(nextNodes, leaf.nodeId, nextText)
    }
  }
  if (nextNodes === section.nodes) return sectioning
  return withSectionNodes(sectioning, sectionIndex, nextNodes)
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
  hasPrevPage,
  hasNextPage,
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
  /** Whether there is a page before/after this one (for cross-page merge) */
  hasPrevPage?: boolean
  hasNextPage?: boolean
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { apiKey, hasApiKey } = useApiKey()
  const { headerSlotEl } = useStepHeader()
  const { stageState } = useBookRun()
  const storyboardRunning = stageState("storyboard") === "running" || stageState("storyboard") === "queued"
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  // Resolved reflowable base font (gated server-side; null for fixed-layout /
  // Merriweather default) — applied to the preview shell to match output.
  const { data: pageDetail } = usePage(bookLabel, pageId)
  const applyBodyBackground = (activeConfigData?.merged as Record<string, unknown> | undefined)?.apply_body_background !== false

  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [merging, setMerging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState<{ action: () => Promise<void>; label: string } | null>(null)
  const [pendingSectioning, setPendingSectioning] = useState<SectioningData | null>(null)
  const [pendingRendering, setPendingRendering] = useState<RenderingData | null>(null)
  // Inspector edits mutate the iframe DOM directly; this ref stashes the
  // resulting HTML and is committed to React state only at boundaries
  // (selection change, save, unmount) so per-keystroke changes don't
  // re-render BookPreviewFrame and rebuild its body.
  const pendingHtmlRef = useRef<{ html: string; sectionIndex: number } | null>(null)
  // Stamped by `discardAll` so late debounced commits get dropped.
  const lastDiscardAtRef = useRef(0)
  // Tracks whether iframe-DOM edits exist that haven't been flushed into
  // pendingRendering yet. Lights up the Save/Discard bar on every change
  // without forcing a per-keystroke iframe rebuild.
  const [hasUnflushedEdits, setHasUnflushedEdits] = useState(false)
  // Tags describing what kind of unsaved edits exist, surfaced in the floating
  // save bar so the user can see what they're about to discard or commit.
  // Cleared on save success and on discard.
  type PendingCategory = "sections" | "style" | "text" | "images" | "elements"
  const [pendingCategories, setPendingCategories] = useState<Set<PendingCategory>>(
    () => new Set()
  )
  const markPending = useCallback((category: PendingCategory) => {
    setPendingCategories((prev) => {
      if (prev.has(category)) return prev
      const next = new Set(prev)
      next.add(category)
      return next
    })
  }, [])
  // Tracks whether pending sectioning changes require LLM re-render on save.
  // Pure prune/delete can be resolved locally; unprune/type change/reorder need LLM.
  const needsRerenderRef = useRef(false)

  // Inline editing state
  const [selectedElement, setSelectedElement] = useState<{
    dataId: string
    rect: DOMRect
    iframeTop: number
    iframeLeft: number
    /** Set for container elements (div, section, etc.) that were dynamically assigned a data-id */
    tagName?: string
  } | null>(null)
  const [selectedElementClasses, setSelectedElementClasses] = useState<string[] | null>(null)
  const [selectedComputedTypography, setSelectedComputedTypography] = useState<
    ComputedTypographyStyles | null
  >(null)
  const [deviceView, setDeviceView] = useDeviceView(bookLabel, "desktop")
  const [previewVisibleWidth, setPreviewVisibleWidth] = useState(0)
  const previewFrameRef = useRef<BookPreviewFrameHandle>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Clear cached classes when element is deselected
  useEffect(() => {
    if (!selectedElement) setSelectedElementClasses(null)
  }, [selectedElement])

  // Snapshot the iframe element's getComputedStyle so the inspector can show
  // the actually-rendered value when no explicit class is set (e.g., font-size
  // / color / weight inherited from a parent).
  useEffect(() => {
    if (!selectedElement) {
      setSelectedComputedTypography(null)
      return
    }
    setSelectedComputedTypography(
      previewFrameRef.current?.getComputedTypographyStyles(selectedElement.dataId) ?? null,
    )
  }, [selectedElement, selectedElementClasses])

  // Track current pageId so async callbacks can detect stale closures

  // Section data panel state
  const [panelOpen, setPanelOpen] = useState(false)
  const openSectionPanel = useCallback(() => {
    setPanelOpen((v) => !v)
  }, [])
  const [htmlPreview, setHtmlPreview] = useState(false)
  const [htmlPanelHeight, setHtmlPanelHeight] = useState(() => Math.floor(window.innerHeight * 0.35))
  const htmlPanelRef = useRef<HTMLDivElement>(null)
  const htmlDragging = useRef(false)
  const [htmlDraggingActive, setHtmlDraggingActive] = useState(false)
  const htmlDragCleanup = useRef<(() => void) | null>(null)

  // Clean up drag listeners on unmount
  useEffect(() => {
    return () => {
      htmlDragging.current = false
      htmlDragCleanup.current?.()
    }
  }, [])

  // Image crop state
  const [cropTarget, setCropTarget] = useState<string | null>(null)
  const [recropPageSrc, setRecropPageSrc] = useState<string | null>(null)

  // Image replace / AI image state — tracked via unified task system
  const [aiImageDialogTarget, setAiImageDialogTarget] = useState<string | null>(null)
  const { tasks: bookTasks } = useBookTasks(bookLabel)
  // Track the task we submitted from this component (for done/error dismiss)
  const [aiImageTaskId, setAiImageTaskId] = useState<string | null>(null)
  // Also track what image this task was targeting (for swap vs add)
  const [aiImageTargetInfo, setAiImageTargetInfo] = useState<{
    targetImageId: string
    mode: "swap" | "add"
  } | null>(null)

  // Find the active image-generate task for this page:
  // prefer the one we submitted, otherwise pick any running one (reconnect after navigation)
  const aiImageTask = useMemo(() => {
    if (aiImageTaskId) {
      return bookTasks.find((t) => t.taskId === aiImageTaskId) ?? null
    }
    return bookTasks.find(
      (t) => t.kind === "image-generate" && t.pageId === pageId && t.status === "running"
    ) ?? null
  }, [bookTasks, aiImageTaskId, pageId])

  // Derive pill status
  const aiImageGen = useMemo(() => {
    if (!aiImageTask) return null
    // For tasks we submitted, require aiImageTargetInfo; for reconnected tasks, synthesize it
    const target = aiImageTargetInfo?.targetImageId ?? "__reconnected__"
    if (aiImageTask.status === "running") {
      return { targetImageId: target, status: "generating" as const }
    }
    if (aiImageTask.status === "completed") {
      return { targetImageId: target, status: "done" as const }
    }
    if (aiImageTask.status === "failed") {
      return { targetImageId: target, status: "error" as const, error: aiImageTask.error }
    }
    return null
  }, [aiImageTask, aiImageTargetInfo])
  // Derive re-rendering state from task system (auto-reconnects on navigation)
  const rerendering = useMemo(
    () => bookTasks.some((t) => t.kind === "re-render" && t.pageId === pageId && t.status === "running"),
    [bookTasks, pageId]
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)
  const [replaceFromBookTarget, setReplaceFromBookTarget] = useState<string | null>(null)

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

  // Notify parent when AI image generation starts/stops
  useEffect(() => {
    onGeneratingChange?.(aiImageGen?.status === "generating")
  }, [aiImageGen?.status])

  // Activity preview mode (try the activity in the editor)
  const [activityPreviewMode, setActivityPreviewMode] = useState(false)

  // AI edit state
  const [aiInstruction, setAiInstruction] = useState("")
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiMessageIdx, setAiMessageIdx] = useState(0)
  const [showAiHistory, setShowAiHistory] = useState(false)

  // Derive AI editing state from active tasks
  const aiEditing = useMemo(
    () => bookTasks.some((t) => t.kind === "ai-edit" && t.pageId === pageId && t.status === "running"),
    [bookTasks, pageId]
  )

  // Any task running on this page — used to mask the section and prevent stacking operations
  const hasActiveTask = aiEditing || rerendering || (aiImageGen?.status === "generating")
  const aiLoading = aiEditing
  const aiMessages = getAiMessages()

  useEffect(() => {
    if (!aiLoading) {
      setAiMessageIdx(Math.floor(Math.random() * aiMessages.length))
      return
    }
    const rotate = setInterval(
      () => setAiMessageIdx((i) => (i + 1) % aiMessages.length),
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

  const textTypes = configQuery.data?.merged?.role_types as Record<string, string> | undefined
  const groupTypes = configQuery.data?.merged?.structure_types as Record<string, string> | undefined
  const allSectionTypes = configQuery.data?.merged?.section_types as Record<string, string> | undefined
  const disabledSectionTypes = new Set(configQuery.data?.merged?.disabled_section_types as string[] ?? [])
  const sectionTypes = allSectionTypes
    ? Object.fromEntries(Object.entries(allSectionTypes).filter(([key]) => !disabledSectionTypes.has(key)))
    : undefined

  // Mirrors `discardAll` so navigating away also drops in-flight class edits.
  useEffect(() => {
    setPendingSectioning(null)
    setPendingRendering(null)
    pendingHtmlRef.current = null
    setHasUnflushedEdits(false)
    setPendingCategories(new Set())
    setSelectedElement(null)
    setCropTarget(null)
    setAiImageDialogTarget(null)
    setAddImageDialogOpen(false)
    // Don't cancel running tasks — they continue server-side.
    // Just detach tracking so the result won't be applied to the wrong page.
    setAiImageTaskId(null)
    setAiImageTargetInfo(null)
    setAiInstruction("")
    setAiError(null)
    setSaving(false)
    setActivityPreviewMode(false)
    needsRerenderRef.current = false
  }, [pageId, sectionIndex])

  // Reset scroll position when page or section changes
  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0)
  }, [pageId, sectionIndex])

  // Effective data
  const sectioningData = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
  const dirty = pendingSectioning != null

  // Current section data
  const section = sectioningData?.sections[sectionIndex]
  const renderingData = pendingRendering ?? page.rendering
  const renderedSection = getRenderedSectionByIndex(renderingData, sectionIndex)
  // Fixed-layout pages style every element via inline CSS (the `<p>`'s own
  // `style` + per-run `data-segments`), not Tailwind classes — so the class
  // editor's changes are always overridden and never apply. Disable the
  // class-based style controls for these pages until inline-style editing
  // lands; image actions, prune/delete, and inline text edits still work.
  const isFixedLayout = renderedSection?.sectionType === "fixed-layout-page"
  const renderingDirty = pendingRendering != null || hasUnflushedEdits

  // When server-delivered HTML for the current section changes to something we
  // haven't rendered before, refresh the iframe's Tailwind CSS so new classes
  // get their styles. Local edits call refreshCss directly from their handler
  // (see handleClassesChange) for immediate feedback — this effect only covers
  // server-side changes (AI edit complete, re-render complete).
  const serverHtmlByIndexRef = useRef<Map<number, string>>(new Map())
  useEffect(() => {
    const html = getRenderedSectionByIndex(page.rendering, sectionIndex)?.html
    if (!html) return
    const prev = serverHtmlByIndexRef.current.get(sectionIndex)
    serverHtmlByIndexRef.current.set(sectionIndex, html)
    if (prev !== undefined && prev !== html) {
      previewFrameRef.current?.refreshCss(html)
    }
  }, [page.rendering, sectionIndex])

  // Tree nodes for the current section (empty if section missing — hooks still run)
  const nodes = section?.nodes ?? []

  // Save / discard sectioning
  const saveSectioning = async () => {
    if (!pendingSectioning || storyboardRunning) return
    setSaving(true)
    setPanelOpen(false)
    const shouldRerender = needsRerenderRef.current
    try {
      const minDelay = new Promise((r) => setTimeout(r, 400))

      // Before saving, strip pruned leaves from the rendered HTML so they
      // disappear from the preview without needing an LLM re-render.
      let renderingFromPrune: RenderingData | null = null
      const sectionToSave = pendingSectioning.sections[sectionIndex]
      if (sectionToSave) {
        const prunedIds = collectPrunedLeafIds(sectionToSave.nodes)
        if (prunedIds.length > 0) {
          renderingFromPrune = removeElementsFromRendering(prunedIds)
        }
      }

      await api.updateSectioning(bookLabel, pageId, pendingSectioning)

      // Save rendering if dirty (from delete/prune removing HTML elements).
      // Use renderingFromPrune if we just stripped pruned elements above,
      // since React state won't have updated yet within this async call.
      const flushed = flushPendingHtml()
      const renderingToSave = renderingFromPrune ?? flushed ?? pendingRendering
      if (renderingToSave) {
        await api.updateRendering(bookLabel, pageId, stripTransientIds(renderingToSave))
      }

      setPendingSectioning(null)
      setPendingRendering(null)
      setPendingCategories(new Set())
      needsRerenderRef.current = false
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      invalidateStoryboardDependents(queryClient, bookLabel)
      await minDelay

      // Only re-render when changes require LLM (e.g., unprune, type change, reorder)
      // Skip for pure prune/delete — those are already handled by local HTML removal
      if (shouldRerender && hasApiKey) {
        api.reRenderPage(bookLabel, pageId, apiKey, sectionIndex).catch(() => {})
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t`Save failed`)
    } finally {
      setSaving(false)
    }
  }

  // Wipe every pending change (sectioning, rendering, in-flight class edits)
  // and re-inject the saved HTML into the iframe so live DOM mutations are
  // dropped. All Discard entry points route through here so the semantics stay
  // identical regardless of which control the user clicked.
  const discardAll = () => {
    lastDiscardAtRef.current = Date.now()
    setPendingSectioning(null)
    setPendingRendering(null)
    setPendingCategories(new Set())
    pendingHtmlRef.current = null
    setHasUnflushedEdits(false)
    needsRerenderRef.current = false
    previewFrameRef.current?.resetContent()
  }

  // Save rendering (including back-propagation to sectioning)
  const saveRendering = async () => {
    const flushed = flushPendingHtml()
    const renderingToSave = flushed ?? pendingRendering
    if (!renderingToSave || storyboardRunning) return
    setSaving(true)
    setPanelOpen(false)
    try {
      const minDelay = new Promise((r) => setTimeout(r, 400))

      await api.updateRendering(bookLabel, pageId, stripTransientIds(renderingToSave))

      // Back-propagate text changes into sectioning. `renderingToSave` already
      // includes the flushed inspector edit; the closure `pendingRendering`
      // is stale until React re-renders.
      const editedHtml = getRenderedSectionByIndex(renderingToSave, sectionIndex)?.html
      const sBase = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
      if (editedHtml && sBase) {
        const updatedSectioning = backPropagateTextChanges(
          sBase,
          sectionIndex,
          editedHtml
        )
        if (updatedSectioning !== sBase) {
          await api.updateSectioning(bookLabel, pageId, updatedSectioning)
        }
      }

      setPendingRendering(null)
      setPendingSectioning(null)
      setPendingCategories(new Set())
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      invalidateStoryboardDependents(queryClient, bookLabel)
      await minDelay
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t`Save failed`)
    } finally {
      setSaving(false)
    }
  }

  // Register combined pending state (sectioning + rendering + inspector edits)
  // with the shared floating save bar. Category chips carry over as the label.
  const pendingChipCats = (() => {
    const active = new Set(pendingCategories)
    if (dirty) active.add("sections")
    const ordered: PendingCategory[] = ["sections", "style", "text", "images", "elements"]
    return ordered.filter((c) => active.has(c))
  })()
  const pendingChipLabels: Record<PendingCategory, string> = {
    sections: t`Sections`,
    style: t`Style`,
    text: t`Text`,
    images: t`Images`,
    elements: t`Elements`,
  }
  const pendingChipIcons: Record<PendingCategory, typeof Layers> = {
    sections: Layers,
    style: Palette,
    text: Type,
    images: ImageIcon,
    elements: Boxes,
  }
  useFloatingSave({
    id: `storyboard:${pageId}`,
    dirty: dirty || renderingDirty,
    saving,
    labelKey: pendingChipCats.join(","),
    label:
      pendingChipCats.length > 0 ? (
        <div className="flex items-center gap-1">
          {pendingChipCats.map((cat) => (
            <PendingChip key={cat} icon={pendingChipIcons[cat]}>
              {pendingChipLabels[cat]}
            </PendingChip>
          ))}
        </div>
      ) : undefined,
    onSave: () => {
      if (renderingDirty) void saveRendering()
      else if (pendingSectioning) void saveSectioning()
    },
    onDiscard: discardAll,
  })

  // Clone current section
  const handleCloneSection = async () => {
    if (cloning || dirty || renderingDirty || saving || storyboardRunning) return
    setCloning(true)
    try {
      const result = await api.cloneSection(bookLabel, pageId, sectionIndex)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      invalidateStoryboardDependents(queryClient, bookLabel)
      onNavigateSection?.(result.clonedSectionIndex)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t`Clone failed`)
    } finally {
      setCloning(false)
    }
  }

  // Merge current section with next or previous (actual execution)
  const executeMergeSection = async (direction: "next" | "prev") => {
    setMerging(true)
    try {
      const result = await api.mergeSection(bookLabel, pageId, sectionIndex, direction)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      invalidateStoryboardDependents(queryClient, bookLabel)
      onNavigateSection?.(result.mergedSectionIndex)

      // Auto re-render the merged section so the LLM generates proper HTML for the combined content
      if (hasApiKey) {
        api.reRenderPage(bookLabel, pageId, apiKey, result.mergedSectionIndex).catch(() => {})
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t`Merge failed`)
    } finally {
      setMerging(false)
    }
  }

  // Merge current section across page boundary (actual execution)
  const executeMergeCrossPage = async (direction: "next" | "prev") => {
    setMerging(true)
    try {
      const result = await api.mergeSectionCrossPage(bookLabel, pageId, sectionIndex, direction)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", result.sourcePageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", result.targetPageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      invalidateStoryboardDependents(queryClient, bookLabel)
      // Navigate to the previous section or 0 since the current section was removed
      onNavigateSection?.(Math.max(0, sectionIndex - 1))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t`Merge failed`)
    } finally {
      setMerging(false)
    }
  }

  // Confirmation wrappers for merge actions
  const handleMergeSection = (direction: "next" | "prev") => {
    if (merging || dirty || renderingDirty || saving || storyboardRunning) return
    const label = direction === "prev" ? t`merge with previous` : t`merge with next`
    setConfirmMerge({ action: () => executeMergeSection(direction), label })
  }

  const handleMergeCrossPage = (direction: "next" | "prev") => {
    if (merging || dirty || renderingDirty || saving || storyboardRunning) return
    const label = direction === "prev" ? t`merge into previous page` : t`merge into next page`
    setConfirmMerge({ action: () => executeMergeCrossPage(direction), label })
  }

  // Delete current section
  const handleDeleteSection = () => {
    if (deleting || dirty || renderingDirty || saving || storyboardRunning) return
    setConfirmDeleteSection(true)
  }

  const confirmAndDeleteSection = async () => {
    setConfirmDeleteSection(false)
    setDeleting(true)
    try {
      const result = await api.deleteSection(bookLabel, pageId, sectionIndex)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      invalidateStoryboardDependents(queryClient, bookLabel)
      onNavigateSection?.(Math.max(0, Math.min(sectionIndex, result.remainingSections - 1)))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t`Delete failed`)
    } finally {
      setDeleting(false)
    }
  }

  // Manually trigger a re-render of the current section.
  // If there are pending rendering edits, diff them against the saved version
  // and inject structured instructions so the LLM preserves the user's changes.
  const handleRerender = (prompt?: string) => {
    if (hasActiveTask || storyboardRunning || dirty || renderingDirty || saving || !hasApiKey) return
    setPanelOpen(false)

    // Build edit instructions from pending changes
    let editInstructions = ""
    if (pendingRendering && page.rendering) {
      const savedHtml = getRenderedSectionByIndex(page.rendering, sectionIndex)?.html ?? ""
      const pendingHtml = getRenderedSectionByIndex(pendingRendering, sectionIndex)?.html ?? ""
      editInstructions = buildEditInstructions(savedHtml, pendingHtml)
    }

    // Combine edit instructions with any user prompt
    const parts: string[] = []
    if (editInstructions) parts.push(editInstructions)
    if (prompt) parts.push(prompt)
    const combinedPrompt = parts.join("\n\n") || undefined

    // Save pending state so we can restore on failure
    const savedPending = pendingRendering
    if (pendingRendering) {
      setPendingRendering(null)
    }

    api.reRenderPage(bookLabel, pageId, apiKey, sectionIndex, combinedPrompt)
      .catch((err) => {
        // Restore pending edits so the user doesn't lose their work
        if (savedPending) setPendingRendering(savedPending)
        setAiError(err instanceof Error ? err.message : t`Re-render failed`)
      })
  }

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
        // Guard: never remove the section wrapper or the outer content/container div
        const isSectionWrapper = blockParent?.getAttribute("data-section-id") != null
        const isOuterContainer =
          blockParent?.id === "content" || blockParent?.classList.contains("container")
        if (isSectionWrapper || isOuterContainer) {
          el.remove()
        } else if (blockParent && blockParent.querySelectorAll("[data-id]").length <= 1) {
          blockParent.remove()
        } else {
          el.remove()
        }
        removed = true
      }

      if (!removed) return null

      const newHtml = doc.body.innerHTML
      const updated: RenderingData = {
        ...rBase,
        sections: rBase.sections.map((s) => {
          if (s.sectionIndex !== sectionIndex) return s
          return { ...s, html: newHtml }
        }),
      }
      setPendingRendering(updated)
      markPending("elements")
      return updated
    },
    [pendingRendering, page.rendering, sectionIndex, markPending]
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

      const newHtml = doc.body.innerHTML
      const updated: RenderingData = {
        ...rBase,
        sections: rBase.sections.map((s) => {
          if (s.sectionIndex !== sectionIndex) return s
          return { ...s, html: newHtml }
        }),
      }
      setPendingRendering(updated)
      markPending("elements")
    },
    [pendingRendering, page.rendering, sectionIndex, markPending]
  )

  // Replace textContent of a single [data-id="..."] element in the rendered HTML.
  const updateElementTextInRendering = useCallback(
    (dataId: string, newText: string) => {
      const rBase = pendingRendering ?? page.rendering
      if (!rBase) return
      const currentSection = getRenderedSectionByIndex(rBase, sectionIndex)
      if (!currentSection?.html) return
      const parser = new DOMParser()
      const doc = parser.parseFromString(currentSection.html, "text/html")
      const el = doc.querySelector(`[data-id="${dataId}"]`)
      if (!el) {
        // Element not in HTML — re-render needed to sync
        needsRerenderRef.current = true
        return
      }
      el.textContent = newText
      const newHtml = doc.body.innerHTML
      const updated: RenderingData = {
        ...rBase,
        sections: rBase.sections.map((s) => {
          if (s.sectionIndex !== sectionIndex) return s
          return { ...s, html: newHtml }
        }),
      }
      setPendingRendering(updated)
      markPending("text")
    },
    [pendingRendering, page.rendering, sectionIndex, markPending]
  )

  // Update a single activity answer value in the rendering
  const updateAnswer = useCallback(
    (itemKey: string, value: string) => {
      const rBase = pendingRendering ?? page.rendering
      if (!rBase) return
      const updated = {
        ...rBase,
        sections: rBase.sections.map((s) => {
          if (s.sectionIndex !== sectionIndex) return s
          return {
            ...s,
            activityAnswers: { ...s.activityAnswers, [itemKey]: value },
          }
        }),
      }
      setPendingRendering(updated)
      markPending("text")
    },
    [pendingRendering, page.rendering, sectionIndex, markPending]
  )

  // Delete selected block from rendered HTML and remove the matching leaf from sectioning.
  const handleDeleteBlock = useCallback(
    (dataId: string) => {
      removeElementsFromRendering([dataId])
      const sBase = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
      if (sBase && section) {
        const nextNodes = deleteNode(section.nodes, dataId)
        if (nextNodes !== section.nodes) {
          setPendingSectioning(withSectionNodes(sBase, sectionIndex, nextNodes))
        }
      }
      setSelectedElement(null)
    },
    [removeElementsFromRendering, pendingSectioning, page.sectioningTree, sectionIndex, section]
  )

  // Replace the current section with an updated copy (from SectionTreeEditor).
  const handleSectionChange = useCallback(
    (next: PageSectioningSection) => {
      const base = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
      if (!base) return
      setPendingSectioning(replaceSection(base, sectionIndex, next))
    },
    [pendingSectioning, page.sectioningTree, sectionIndex]
  )

  // Toggle isPruned on a leaf or container in the current section (by nodeId).
  const toggleLeafPrunedById = useCallback(
    (nodeId: string) => {
      const base = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
      if (!base || !section) return
      const target = findNode(section.nodes, nodeId)
      const wasPruned = target?.isPruned ?? false
      const nextNodes = toggleNodePruned(section.nodes, nodeId)
      if (nextNodes === section.nodes) return
      setPendingSectioning(withSectionNodes(base, sectionIndex, nextNodes))
      // Unpruning restores the element to the render — LLM re-render required.
      if (wasPruned) needsRerenderRef.current = true
    },
    [pendingSectioning, page.sectioningTree, sectionIndex, section]
  )

  // Toggle isPruned on the current section
  const toggleSectionPruned = () => {
    if (storyboardRunning) return
    const base = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
    if (!base) return
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
    const base = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
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

  // Change text role for a leaf (by nodeId)
  const setLeafRoleById = useCallback(
    (nodeId: string, role: string) => {
      const base = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
      if (!base || !section) return
      const nextNodes = setLeafRole(section.nodes, nodeId, role)
      if (nextNodes === section.nodes) return
      setPendingSectioning(withSectionNodes(base, sectionIndex, nextNodes))
      needsRerenderRef.current = true
    },
    [pendingSectioning, page.sectioningTree, sectionIndex, section]
  )

  // SectionTreeEditor callbacks — mirror tree changes into the preview HTML.
  const handleLeafTextEdited = useCallback(
    (nodeId: string, newText: string) => {
      updateElementTextInRendering(nodeId, newText)
    },
    [updateElementTextInRendering]
  )

  const handleLeafDuplicated = useCallback(
    (sourceNodeId: string, newNodeId: string) => {
      duplicateElementsInRendering([{ sourceDataId: sourceNodeId, newDataId: newNodeId }])
    },
    [duplicateElementsInRendering]
  )

  const handleLeafDeleted = useCallback(
    (nodeId: string) => {
      removeElementsFromRendering([nodeId])
    },
    [removeElementsFromRendering]
  )

  const handleStructuralChange = useCallback(() => {
    needsRerenderRef.current = true
  }, [])

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
      markPending("text")
    },
    [page.rendering, pendingRendering, sectionIndex, markPending]
  )

  // Handle element selection from BookPreviewFrame
  const handleSelectElement = useCallback((dataId: string, rect: DOMRect, tagName?: string) => {
    if (!dataId) {
      setSelectedElement(null)
      setSelectedElementClasses(null)
      return
    }
    // Capture iframe viewport position at click time for accurate toolbar placement
    const iframeRect = previewFrameRef.current?.getIframeRect()
    setSelectedElement({
      dataId,
      rect,
      iframeTop: iframeRect?.top ?? 0,
      iframeLeft: iframeRect?.left ?? 0,
      tagName,
    })
    // Snapshot element classes once at selection time (not during render)
    setSelectedElementClasses(previewFrameRef.current?.getElementClasses(dataId) ?? null)
  }, [])

  const handleClassesChange = useCallback(
    (dataId: string, classes: string[]) => {
      if (!page.rendering) return
      // 250ms covers the inspector's 200ms debounce plus slack.
      if (Date.now() - lastDiscardAtRef.current < 250) return
      const fullHtml = previewFrameRef.current?.setElementClasses(dataId, classes)
      if (!fullHtml) return
      setSelectedElementClasses(classes)
      previewFrameRef.current?.refreshCss(fullHtml)
      pendingHtmlRef.current = { html: fullHtml, sectionIndex }
      setHasUnflushedEdits(true)
      markPending("style")
    },
    [page.rendering, sectionIndex, markPending]
  )

  const flushPendingHtml = useCallback((): RenderingData | null => {
    const queued = pendingHtmlRef.current
    if (!queued) return pendingRendering
    if (!page.rendering) return pendingRendering
    pendingHtmlRef.current = null
    setHasUnflushedEdits(false)
    const base = pendingRendering ?? page.rendering
    const merged: RenderingData = {
      ...base,
      sections: base.sections.map((s) =>
        s.sectionIndex !== queued.sectionIndex ? s : { ...s, html: queued.html }
      ),
    }
    setPendingRendering(merged)
    return merged
  }, [page.rendering, pendingRendering])

  useEffect(() => {
    return () => {
      flushPendingHtml()
    }
  }, [selectedElement?.dataId, flushPendingHtml])

  // Handle toolbar prune toggle (nodeId === data-id in tree shape)
  const handleToolbarPrune = useCallback(
    (dataId: string) => {
      toggleLeafPrunedById(dataId)
    },
    [toggleLeafPrunedById]
  )

  // Handle toolbar text role change
  const handleToolbarChangeTextType = useCallback(
    (dataId: string, newType: string) => {
      setLeafRoleById(dataId, newType)
    },
    [setLeafRoleById]
  )

  // Handle crop apply: upload cropped image, update sectioning + rendering HTML
  const handleCropApply = useCallback(
    async (blob: Blob) => {
      if (!cropTarget) return
      const result = await api.uploadCroppedImage(bookLabel, pageId, cropTarget, blob)

      // 1. Update sectioning: swap the image leaf's nodeId (which IS the imageId)
      const sBase = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
      if (sBase && section) {
        const nextNodes = replaceNodeId(section.nodes, cropTarget, result.imageId)
        if (nextNodes !== section.nodes) {
          setPendingSectioning(withSectionNodes(sBase, sectionIndex, nextNodes))
        }
      }

      // 2. Update rendered HTML to swap image references so preview reflects the crop
      const rBase = pendingRendering ?? page.rendering
      if (rBase) {
        const oldSrc = renderedImageSrc(bookLabel, cropTarget)
        const newSrc = renderedImageSrc(bookLabel, result.imageId)
        const updatedRendering: RenderingData = {
          ...rBase,
          sections: rBase.sections.map((s) => {
            if (s.sectionIndex !== sectionIndex) return s
            let html = s.html
            html = html.replace(new RegExp(`data-id="${escapeRegex(cropTarget)}"`, "g"), `data-id="${result.imageId}"`)
            html = html.replace(new RegExp(escapeRegex(oldSrc), "g"), newSrc)
            return { ...s, html }
          }),
        }
        setPendingRendering(updatedRendering)
        markPending("images")
      }

      setCropTarget(null)
      setRecropPageSrc(null)
      setSelectedElement(null)
    },
    [cropTarget, bookLabel, pageId, pendingSectioning, page.sectioningTree, pendingRendering, page.rendering, sectionIndex, section]
  )

  // Recrop from page: fetch the full page image and open crop dialog with it
  const handleRecropFromPage = useCallback(async (dataId: string) => {
    try {
      const { imageBase64 } = await api.getPageImage(bookLabel, pageId)
      setCropTarget(dataId)
      setRecropPageSrc(`data:image/png;base64,${imageBase64}`)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t`Failed to load page image`)
    }
  }, [bookLabel, pageId, t])

  // Image replace: open native file picker
  const handleImageReplace = useCallback((dataId: string) => {
    replaceTargetRef.current = dataId
    fileInputRef.current?.click()
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
        setAiError(err instanceof Error ? err.message : t`Image upload failed`)
        return
      }

      const sBase = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
      if (sBase && section) {
        const nextNodes = replaceNodeId(section.nodes, targetId, result.imageId)
        if (nextNodes !== section.nodes) {
          setPendingSectioning(withSectionNodes(sBase, sectionIndex, nextNodes))
        }
      }

      const rBase = pendingRendering ?? page.rendering
      if (rBase) {
        const oldSrc = renderedImageSrc(bookLabel, targetId)
        const newSrc = renderedImageSrc(bookLabel, result.imageId)
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
        markPending("images")
      }
    },
    [bookLabel, pageId, pendingSectioning, page.sectioningTree, pendingRendering, page.rendering, sectionIndex, section, t]
  )

  // Replace from book: open picker dialog
  const handleReplaceFromBook = useCallback((dataId: string) => {
    setReplaceFromBookTarget(dataId)
  }, [])

  // Process replace-from-book selection: swap image in sectioning + rendering
  const handleReplaceFromBookSelect = useCallback(
    (newImageId: string) => {
      const targetId = replaceFromBookTarget
      if (!targetId) return
      setReplaceFromBookTarget(null)

      const sBase = pendingSectioning ?? (page.sectioningTree as SectioningData | null)
      if (sBase && section) {
        const nextNodes = replaceNodeId(section.nodes, targetId, newImageId)
        if (nextNodes !== section.nodes) {
          setPendingSectioning(withSectionNodes(sBase, sectionIndex, nextNodes))
        }
      }

      const rBase = pendingRendering ?? page.rendering
      if (rBase) {
        const oldSrc = renderedImageSrc(bookLabel, targetId)
        const newSrc = renderedImageSrc(bookLabel, newImageId)
        const updatedRendering: RenderingData = {
          ...rBase,
          sections: rBase.sections.map((s) => {
            if (s.sectionIndex !== sectionIndex) return s
            let html = s.html
            html = html.replace(new RegExp(`data-id="${escapeRegex(targetId)}"`, "g"), `data-id="${newImageId}"`)
            html = html.replace(new RegExp(escapeRegex(oldSrc), "g"), newSrc)
            return { ...s, html }
          }),
        }
        setPendingRendering(updatedRendering)
        markPending("images")
      }
    },
    [bookLabel, replaceFromBookTarget, pendingSectioning, page.sectioningTree, pendingRendering, page.rendering, sectionIndex, section]
  )

  // Open AI image dialog for a specific image
  const handleAiImage = useCallback((dataId: string) => {
    setAiImageDialogTarget(dataId)
  }, [])

  // Run LLM segmentation analysis on a single image (phase 1: get bounding boxes)
  const handleSegment = useCallback(
    async (dataId: string) => {
      if (!hasApiKey) return
      setSegmenting(true)

      try {
        const result = await api.segmentImage(bookLabel, dataId, pageId, apiKey)

        if (!result.segmented || !result.regions || result.regions.length === 0) {
          const noSegMsg = t`No segmentation needed for this image`
          setAiError(noSegMsg)
          setTimeout(() => setAiError((prev) => prev === noSegMsg ? null : prev), 3000)
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
        setAiError(err instanceof Error ? err.message : t`Segmentation failed`)
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
          setAiError(t`Segmentation produced no valid segments`)
          return
        }

        // Replace the original image with segment images in sectioning
        setPendingSectioning((prev) => {
          const sBase = prev ?? (page.sectioningTree as SectioningData | null)
          if (!sBase) return prev
          const targetSection = sBase.sections[sectionIndex]
          if (!targetSection) return prev
          const segmentLeaves: ContentNodeData[] = result.segments.map((seg) => ({
            nodeId: seg.imageId,
            role: "image",
            isPruned: false,
          }))
          const nextNodes = replaceNodeWithSiblings(
            targetSection.nodes,
            imageId,
            segmentLeaves
          )
          if (nextNodes === targetSection.nodes) return prev
          return withSectionNodes(sBase, sectionIndex, nextNodes)
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
                    `<img data-id="${seg.imageId}" src="${renderedImageSrc(bookLabel, seg.imageId)}" width="${seg.width}" height="${seg.height}" alt="${seg.label}" class="w-full" />`
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
        setAiError(err instanceof Error ? err.message : t`Segmentation apply failed`)
      }
    },
    [segmentPreview, bookLabel, pageId, page.sectioningTree, page.rendering, sectionIndex, t]
  )

  // Swap a generated/edited image into pending sectioning + rendering.
  // Uses functional setState to avoid stale closures from async callers (e.g. AI generation).
  const pageDataRef = useRef({
    sectioningTree: page.sectioningTree as SectioningData | null,
    rendering: page.rendering,
  })
  pageDataRef.current = {
    sectioningTree: page.sectioningTree as SectioningData | null,
    rendering: page.rendering,
  }

  const swapImage = useCallback(
    (targetId: string, newImageId: string, originalDims?: { w: number; h: number }) => {
      setPendingSectioning((prev) => {
        const sBase = prev ?? pageDataRef.current.sectioningTree
        if (!sBase) return prev
        const target = sBase.sections[sectionIndex]
        if (!target) return prev
        const nextNodes = replaceNodeId(target.nodes, targetId, newImageId)
        if (nextNodes === target.nodes) return prev
        return withSectionNodes(sBase, sectionIndex, nextNodes)
      })

      setPendingRendering((prev) => {
        const rBase = prev ?? pageDataRef.current.rendering
        if (!rBase) return prev
        const oldSrc = renderedImageSrc(bookLabel, targetId)
        const newSrc = renderedImageSrc(bookLabel, newImageId)
        return {
          ...rBase,
          sections: rBase.sections.map((s) => {
            if (s.sectionIndex !== sectionIndex) return s
            let html = s.html
            html = html.replace(new RegExp(`data-id="${escapeRegex(targetId)}"`, "g"), `data-id="${newImageId}"`)
            html = html.replace(new RegExp(escapeRegex(oldSrc), "g"), newSrc)
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

  // Add a new image leaf to the current section (at root) and inject into HTML.
  const addImageToSection = useCallback(
    (newImageId: string, dims?: { w: number; h: number }) => {
      setPendingSectioning((prev) => {
        const sBase = prev ?? pageDataRef.current.sectioningTree
        if (!sBase) return prev
        const target = sBase.sections[sectionIndex]
        if (!target) return prev
        if (findNode(target.nodes, newImageId)) return prev
        const nextNodes = addImageLeaf(target.nodes, null, { imageId: newImageId })
        return withSectionNodes(sBase, sectionIndex, nextNodes)
      })

      setPendingRendering((prev) => {
        const rBase = prev ?? pageDataRef.current.rendering
        if (!rBase) return prev
        // eslint-disable-next-line lingui/no-unlocalized-strings
        const imgTag = `<img data-id="${newImageId}" src="${renderedImageSrc(bookLabel, newImageId)}"${dims ? ` width="${dims.w}" height="${dims.h}"` : ""} alt="${newImageId}" class="w-full" />`
        return {
          ...rBase,
          sections: rBase.sections.map((s) => {
            if (s.sectionIndex !== sectionIndex) return s
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

  // Refresh page data when AI image task completes (server auto-saves new version)
  const prevAiTaskStatusRef = useRef<string | null>(null)
  useEffect(() => {
    if (!aiImageTask) {
      prevAiTaskStatusRef.current = null
      return
    }
    const prev = prevAiTaskStatusRef.current
    prevAiTaskStatusRef.current = aiImageTask.status

    // Only act on the transition to "completed"
    if (prev === "completed" || aiImageTask.status !== "completed") return

    // Server already saved new sectioning/rendering versions — just refresh
    void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })

    // Auto-dismiss success after 3s
    setTimeout(() => {
      setAiImageTaskId((prev) => {
        if (prev === aiImageTask.taskId) return null
        return prev
      })
      setAiImageTargetInfo(null)
    }, 3000)
  }, [aiImageTask?.status, bookLabel, pageId, queryClient])

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
        setAiError(err instanceof Error ? err.message : t`Image upload failed`)
      }
    },
    [bookLabel, pageId, addImageToSection]
  )

  const handleAddImageGenerate = useCallback(
    async (prompt: string) => {
      setAddImageDialogOpen(false)
      try {
        const result = await api.aiGenerateImage(bookLabel, pageId, prompt, apiKey, pageId, undefined, undefined, {
          sectionIndex,
          mode: "add",
        })
        if (result.taskId) {
          setAiImageTaskId(result.taskId)
          setAiImageTargetInfo({ targetImageId: "__adding__", mode: "add" })
        }
      } catch (err) {
        // Submission failed (not generation — that happens async)
        console.error("[ai-image] Task submission failed:", err)
      }
    },
    [bookLabel, pageId, apiKey, sectionIndex]
  )

  // Submit from AI image dialog: close dialog, submit task for generation
  const handleAiImageSubmit = useCallback(
    async (prompt: string, referenceImageId?: string, options?: { style?: string; imageType?: string; styleImageId?: string }) => {
      const targetId = aiImageDialogTarget
      if (!targetId) return
      setAiImageDialogTarget(null)

      try {
        const result = await api.aiGenerateImage(bookLabel, pageId, prompt, apiKey, targetId, referenceImageId, undefined, {
          ...options,
          sectionIndex,
          mode: "swap",
        })
        if (result.taskId) {
          setAiImageTaskId(result.taskId)
          setAiImageTargetInfo({ targetImageId: targetId, mode: "swap" })
        }
      } catch (err) {
        console.error("[ai-image] Task submission failed:", err)
      }
    },
    [aiImageDialogTarget, bookLabel, pageId, apiKey, sectionIndex]
  )

  // AI edit handler
  const handleAiEdit = async () => {
    if (!aiInstruction.trim() || !hasApiKey || hasActiveTask || storyboardRunning) return
    setAiError(null)

    const currentHtml = renderedSection?.html
    const instruction = aiInstruction.trim()
    setAiInstruction("")

    api.aiEditSection(
      bookLabel,
      pageId,
      sectionIndex,
      instruction,
      apiKey,
      currentHtml,
    ).catch((err) => {
      setAiError(err instanceof Error ? err.message : t`AI edit failed`)
    })
  }

  const getSelectedElementInfo = () => {
    if (!selectedElement || !sectioningData) return null
    const { dataId, tagName } = selectedElement
    const tag = tagName?.toLowerCase()

    const leaf = section ? findNode(section.nodes, dataId) : null
    const isImage =
      tag === "img" ||
      leaf?.role === "image" ||
      (!leaf && !tag && dataId.includes("_im"))

    const isContainer = !isImage && (!tag || !TEXT_LIKE_TAGS.has(tag))

    return {
      isImage,
      isContainer,
      tagName: tag,
      textType: leaf && !isImage ? leaf.role : undefined,
      isPruned: leaf?.isPruned ?? false,
      imageSrc: isImage ? `${BASE_URL}/books/${bookLabel}/images/${dataId}` : undefined,
    }
  }

  const selectedInfo = selectedElement ? getSelectedElementInfo() : null

  // Compute pruned data-ids for optimistic preview feedback
  const prunedDataIds = useMemo(() => collectPrunedLeafIds(nodes), [nodes])

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

    // Diff sectioning for image leaf id changes (segmentation / AI generation).
    // The tree form doesn't carry the old id forward, so we compare the leaf
    // id sets of the saved and pending sections — ids in pending but not saved
    // are the "new" leaves to highlight.
    if (pendingSectioning && page.sectioningTree) {
      const savedSection = page.sectioningTree.sections[sectionIndex]
      const pendingSection = pendingSectioning.sections[sectionIndex]
      if (savedSection && pendingSection) {
        const savedImageIds = new Set<string>()
        for (const leaf of collectLeafNodes(savedSection.nodes)) {
          if (leaf.role === "image") savedImageIds.add(leaf.nodeId)
        }
        for (const leaf of collectLeafNodes(pendingSection.nodes)) {
          if (leaf.role === "image" && !savedImageIds.has(leaf.nodeId) && !seen.has(leaf.nodeId)) {
            seen.add(leaf.nodeId)
            changes.push({ dataId: leaf.nodeId })
          }
        }
      }
    }

    return changes
  }, [pendingRendering, pendingSectioning, page.rendering, page.sectioningTree, sectionIndex])

  // Are there any text leaves or image leaves in the section tree?
  const leafNodes = useMemo(() => collectLeafNodes(nodes), [nodes])
  const hasTextParts = leafNodes.some((l) => l.role && l.role !== "image")
  const hasImageParts = leafNodes.some((l) => l.role === "image")

  // Activity sections get a banner above the rendered preview so the user can
  // tell at a glance that they're editing an interactive question/exercise
  // rather than narrative content. Detect primarily by section type (covers
  // activities with no fixed answers, e.g. open-ended) and fall back to the
  // rendered activity metadata.
  const isActivitySection = Boolean(
    section?.sectionType?.startsWith("activity_") ||
      renderedSection?.activityReasoning ||
      (renderedSection?.activityAnswers &&
        Object.keys(renderedSection.activityAnswers).length > 0)
  )
  const activityTypeLabel = section?.sectionType ? getSectionTypeLabel(section.sectionType) : ""

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
        title={section?.isPruned ? t`Restore section to flow` : t`Prune section from flow`}
      >
        {section?.isPruned ? (
          <EyeOff className="h-3.5 w-3.5 text-amber-200" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      <VersionPicker
        step="web-rendering"
        itemId={pageId}
        currentVersion={page.versions.rendering}
        saving={saving}
        dirty={renderingDirty}
        bookLabel={bookLabel}
        onPreview={(data) => setPendingRendering(data as RenderingData)}
        onSave={saveRendering}
        onDiscard={discardAll}
        renderSaveBar={false}
      />
      <ViewportToggle
        value={deviceView}
        onChange={setDeviceView}
        currentWidth={previewVisibleWidth}
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
            placeholder={hasActiveTask || storyboardRunning ? t`Task running...` : t`Ask AI to edit...`}
            disabled={hasActiveTask || storyboardRunning}
            className={`pl-7 h-7 text-[11px] bg-white border-white/40 text-gray-900 placeholder:text-gray-400 focus-visible:ring-white/50 ${hasActiveTask ? "opacity-60" : ""}`}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}
      {renderedSection?.html && hasApiKey && (
        <button
          type="button"
          onClick={() => setShowAiHistory((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer shrink-0 ${
            showAiHistory ? "bg-white/30" : "bg-white/10 hover:bg-white/20"
          }`}
          title={showAiHistory ? t`Hide AI edit history` : t`Show AI edit history`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
      )}
      {renderedSection?.html && (
        <button
          type="button"
          onClick={() => setHtmlPreview((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer shrink-0 ${
            htmlPreview ? "bg-white/30" : "bg-white/10 hover:bg-white/20"
          }`}
          title={htmlPreview ? t`Back to preview` : t`View HTML source`}
        >
          <Code className="h-3.5 w-3.5" />
          <span className="text-[10px]">{t`HTML`}</span>
        </button>
      )}
      <button
        type="button"
        onClick={openSectionPanel}
        className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors cursor-pointer shrink-0"
        title={panelOpen ? t`Close edit panel` : t`Open edit panel`}
      >
        {panelOpen ? (
          <PanelRightClose className="h-3.5 w-3.5" />
        ) : (
          <PanelRightOpen className="h-3.5 w-3.5" />
        )}
        <span className="text-[10px]">{t`Edit`}</span>
        {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={t`Unsaved changes`} />}
      </button>
      {navigationArrows}
    </>
  )

  if (!section) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t`Section not found.`}
      </div>
    )
  }

  return (
    <>
    {headerSlotEl && createPortal(headerControls, headerSlotEl)}
    <div className="h-full flex overflow-hidden">
    <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
      {/* Error bar below header */}
      {aiError && (
        <div className="px-4 py-1.5 border-b shrink-0 text-xs bg-muted/30">
          <p className="text-[10px] text-destructive">{aiError}</p>
        </div>
      )}

      {showAiHistory && (
        <div className="px-4 shrink-0">
          <AiEditHistoryDrawer
            open={showAiHistory}
            label={bookLabel}
            pageId={pageId}
            sectionIndex={sectionIndex}
          />
        </div>
      )}

      {/* Preview — fills remaining space, scrolls independently */}
      <div
        className="flex-1 overflow-auto px-4 py-4 relative [scrollbar-gutter:stable]"
        ref={scrollContainerRef}
      >
        {!section ? (
          <StageEmptyState
            icon={LayoutGrid}
            color="violet"
            title={t`No sections on this page`}
            subtitle={t`All sections have been deleted`}
          />
        ) : renderedSection?.html ? (
          <>
            {isActivitySection && (
              <StorySectionBanner
                tone="violet"
                icon={<Puzzle className="w-4 h-4" />}
                title={activityTypeLabel || t`Activity`}
                subtitle={t`Interactive page: AI conversion from the original PDF.`}
              />
            )}
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
                  className="w-full rounded borde"
                  editable={!hasActiveTask && !storyboardRunning}
                  prunedDataIds={prunedDataIds}
                  changedElements={changedElements}
                  onSelectElement={handleSelectElement}
                  onTextChanged={handleTextChanged}
                  applyBodyBackground={applyBodyBackground}
                  selectedDataId={selectedElement?.dataId ?? null}
                  renderWidth={DEVICE_WIDTHS[deviceView]}
                  deviceView={deviceView}
                  onVisibleWidthChange={setPreviewVisibleWidth}
                  bodyFontFamily={pageDetail?.reflowableFontFamily ?? undefined}
                />
            )}
          </>
        ) : storyboardRunning && !section?.isPruned ? (
          <LoadingState stageSlug="storyboard" label={t`Rendering this section...`} />
        ) : (
          <StageEmptyState
            icon={LayoutGrid}
            color="violet"
            title={t`No rendered content for this section`}
            subtitle={t`This section has no storyboard rendering yet`}
          />
        )}

      </div>

      {/* Pruned section overlay */}
      {section?.isPruned && !hasActiveTask && (
        <div className="absolute inset-0 z-30 bg-background/60 backdrop-blur-[1px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center max-w-xs">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <EyeOff className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{t`Section pruned from flow`}</p>
            <button
              type="button"
              onClick={toggleSectionPruned}
              className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
            >
              {t`Restore`}
            </button>
          </div>
        </div>
      )}

      {hasActiveTask && (
        <div className="absolute inset-0 z-[35] bg-background/50 backdrop-blur-[1px]" />
      )}
      {aiLoading && (
        <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-[2px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-5 text-center max-w-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-bounce [animation-delay:0ms]" />
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-2.5 h-2.5 rounded-full bg-purple-300 animate-bounce [animation-delay:300ms]" />
            </div>
            <p className="text-sm font-medium text-foreground animate-pulse">
              {aiMessages[aiMessageIdx]}
            </p>
          </div>
        </div>
      )}
      {(aiEditing || (rerendering && !saving)) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {aiEditing && (
            <div className="flex items-center gap-2 rounded-full px-3.5 py-2 shadow-lg text-white text-xs font-medium bg-purple-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{t`AI editing...`}</span>
            </div>
          )}
          {rerendering && !saving && (
            <div className="flex items-center gap-2 rounded-full px-3.5 py-2 shadow-lg text-white text-xs font-medium bg-blue-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{t`Re-rendering...`}</span>
            </div>
          )}
        </div>
      )}

      {/* Slide-up HTML editor panel */}
      {htmlPreview && renderedSection && (
        <div
          ref={htmlPanelRef}
          className="border-t border-border bg-[#1e1e2e] flex flex-col shrink-0"
          style={{ height: htmlPanelHeight }}
        >
          <div
            className="flex items-center justify-center h-2 cursor-row-resize hover:bg-white/10 shrink-0"
            onMouseDown={(e) => {
              e.preventDefault()
              htmlDragging.current = true
              setHtmlDraggingActive(true)
              const startY = e.clientY
              const startH = htmlPanelRef.current?.offsetHeight ?? htmlPanelHeight
              const onMove = (ev: MouseEvent) => {
                if (!htmlDragging.current) return
                const delta = startY - ev.clientY
                const maxH = Math.floor(window.innerHeight * 0.8)
                setHtmlPanelHeight(Math.min(maxH, Math.max(150, startH + delta)))
              }
              const onUp = () => {
                htmlDragging.current = false
                setHtmlDraggingActive(false)
                document.removeEventListener("mousemove", onMove)
                document.removeEventListener("mouseup", onUp)
                htmlDragCleanup.current = null
              }
              document.addEventListener("mousemove", onMove)
              document.addEventListener("mouseup", onUp)
              htmlDragCleanup.current = onUp
            }}
          >
            <GripHorizontal className="h-3 w-3 text-gray-500" />
          </div>
          <textarea
            className="flex-1 min-h-0 w-full p-4 text-xs leading-relaxed text-gray-200 font-mono resize-none focus:outline-none bg-transparent"
            spellCheck={false}
            value={renderedSection.html ?? ""}
            onChange={(e) => {
              const base = pendingRendering ?? page.rendering
              if (!base) return
              const updated: RenderingData = {
                ...base,
                sections: base.sections.map((s) => {
                  if (s.sectionIndex !== sectionIndex) return s
                  return { ...s, html: e.target.value }
                }),
              }
              setPendingRendering(updated)
            }}
          />
        </div>
      )}

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
                <span>{t`Generating image...`}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAiImageTaskId(null)
                    setAiImageTargetInfo(null)
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
                <span>{t`Image generated`}</span>
              </>
            )}
            {aiImageGen.status === "error" && (
              <>
                <span>{aiImageGen.error ?? t`Generation failed`}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAiImageTaskId(null)
                    setAiImageTargetInfo(null)
                  }}
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
              {t`Save changes first to preview the latest version`}
            </span>
          )}
          <button
            type="button"
            onClick={() => setActivityPreviewMode((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-md border border-blue-200 transition-colors cursor-pointer opacity-80 hover:opacity-100"
          >
            {activityPreviewMode ? (
              <><PenLine className="h-3 w-3" />{t`Back to Editor`}</>
            ) : (
              <><Play className="h-3 w-3" />{t`Try Activity`}</>
            )}
          </button>
        </div>
      )}



      {/* Slide-out section data panel */}
      {section && (
      <SectionEditPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        section={section}
        sectionIndex={sectionIndex}
        sectionCount={sectioningData?.sections.length ?? 0}
        bookLabel={bookLabel}
        sectionTypes={sectionTypes}
        textTypes={textTypes}
        groupTypes={groupTypes}
        activityAnswers={renderedSection?.activityAnswers}
        onChangeSectionType={changeSectionType}
        onToggleSectionPruned={toggleSectionPruned}
        onSectionChange={handleSectionChange}
        onLeafTextEdited={handleLeafTextEdited}
        onLeafDuplicated={handleLeafDuplicated}
        onLeafDeleted={handleLeafDeleted}
        onStructuralChange={handleStructuralChange}
        onMergeSection={handleMergeSection}
        onMergeCrossPage={handleMergeCrossPage}
        hasPrevPage={hasPrevPage}
        hasNextPage={hasNextPage}
        onCloneSection={handleCloneSection}
        onDeleteSection={handleDeleteSection}
        onRerender={handleRerender}
        onAddImage={() => setAddImageDialogOpen(true)}
        onUpdateAnswer={updateAnswer}
        versionPickerNode={
          <VersionPicker
            step="page-sectioning"
            itemId={pageId}
            currentVersion={page.versions.sectioning}
            saving={saving}
            dirty={dirty}
            bookLabel={bookLabel}
            onPreview={(data) => {
              const s = data as SectioningData
              setPendingSectioning(s)
              if (s.sections && sectionIndex >= s.sections.length) {
                onNavigateSection?.(Math.max(0, s.sections.length - 1))
              }
            }}
            onSave={saveSectioning}
            onDiscard={discardAll}
            renderSaveBar={false}
          />
        }
        merging={merging}
        cloning={cloning}
        deleting={deleting}
        saving={saving}
        pipelineRunning={storyboardRunning}
        rerendering={hasActiveTask}
        dirty={dirty}
        renderingDirty={renderingDirty}
        hasApiKey={hasApiKey}
      />
      )}

      {/* Transparent overlay during drag to prevent iframe from stealing mouse events */}
      {htmlDraggingActive && (
        <div className="absolute inset-0 z-50 cursor-row-resize" />
      )}
    </div>

    {/* Inline element style editor — opens automatically on selection */}
    <StyleEditorPanel
      open={!!selectedElement}
      onClose={() => setSelectedElement(null)}
      selectedDataId={selectedElement?.dataId ?? null}
      selectedTagName={selectedElement?.tagName ?? null}
      elementClasses={selectedElementClasses}
      computedTypography={selectedComputedTypography}
      elementProps={
        selectedElement && selectedInfo
          ? {
                isImage: selectedInfo.isImage,
                isContainer: selectedInfo.isContainer,
                textType: selectedInfo.textType,
                isPruned: selectedInfo.isPruned,
                textTypes,
                imageSrc: selectedInfo.imageSrc,
                segmenting,
                onChangeTextType:
                  storyboardRunning || selectedInfo.isContainer
                    ? undefined
                    : handleToolbarChangeTextType,
                onTogglePrune:
                  storyboardRunning || selectedInfo.isContainer
                    ? undefined
                    : handleToolbarPrune,
                onCrop:
                  selectedInfo.isImage && !storyboardRunning
                    ? (dataId) => setCropTarget(dataId)
                    : undefined,
                onRecropFromPage:
                  selectedInfo.isImage && !storyboardRunning
                    ? handleRecropFromPage
                    : undefined,
                onReplace:
                  selectedInfo.isImage && !storyboardRunning
                    ? handleImageReplace
                    : undefined,
                onReplaceFromBook:
                  selectedInfo.isImage && !storyboardRunning
                    ? handleReplaceFromBook
                    : undefined,
                onAiImage:
                  selectedInfo.isImage && hasApiKey && !storyboardRunning
                    ? handleAiImage
                    : undefined,
                onSegment:
                  selectedInfo.isImage && hasApiKey && !storyboardRunning
                    ? handleSegment
                    : undefined,
                onDelete: !storyboardRunning ? handleDeleteBlock : undefined,
              }
            : null
        }
        onClassesChange={handleClassesChange}
        deviceView={deviceView}
        isFixedLayout={isFixedLayout}
      />
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
        imageSrc={recropPageSrc ?? `${BASE_URL}/books/${bookLabel}/images/${cropTarget}`}
        onApply={handleCropApply}
        onClose={() => { setCropTarget(null); setRecropPageSrc(null) }}
      />
    )}

    {/* Replace from book dialog */}
    {replaceFromBookTarget && (
      <ReplaceFromBookDialog
        bookLabel={bookLabel}
        currentImageId={replaceFromBookTarget}
        onSelect={handleReplaceFromBookSelect}
        onClose={() => setReplaceFromBookTarget(null)}
      />
    )}

    {/* AI image prompt dialog */}
    {aiImageDialogTarget && (
      <AiImageDialog
        currentImageSrc={`${BASE_URL}/books/${bookLabel}/images/${aiImageDialogTarget}`}
        imageId={aiImageDialogTarget}
        bookLabel={bookLabel}
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

    {/* Merge confirmation dialog */}
    <Dialog open={!!confirmMerge} onOpenChange={(open) => { if (!open) setConfirmMerge(null) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t`Confirm merge`}</DialogTitle>
          <DialogDescription>
            {t`Are you sure you want to ${confirmMerge?.label ?? ""}? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => setConfirmMerge(null)}
            className="px-3 py-1.5 text-sm rounded border hover:bg-accent transition-colors cursor-pointer"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            onClick={() => {
              const action = confirmMerge?.action
              setConfirmMerge(null)
              action?.()
            }}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            {t`Continue`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete section confirmation dialog */}
    <Dialog open={confirmDeleteSection} onOpenChange={setConfirmDeleteSection}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t`Delete section`}</DialogTitle>
          <DialogDescription>
            {t`Are you sure you want to delete this section? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => setConfirmDeleteSection(false)}
            className="px-3 py-1.5 text-sm rounded border hover:bg-accent transition-colors cursor-pointer"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            onClick={confirmAndDeleteSection}
            className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer"
          >
            {t`Delete`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
