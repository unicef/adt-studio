import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Link, useMatchRoute, useSearch } from "@tanstack/react-router"
import {
  FileDown,
  Loader2,
  RotateCcw,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useBookRun } from "@/hooks/use-book-run"
import { StepProgressRing } from "./StepProgressRing"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useExportBook } from "@/hooks/use-books"
import {
  STAGES,
  hasStagePages,
  toCamelLabel,
} from "./stage-config"
import { useSettingsDialog } from "@/routes/__root"

const EXTRACT_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "text-types", label: "Text Types" },
  { key: "metadata-prompt", label: "Metadata Prompt" },
  { key: "prompt", label: "Extraction Prompt" },
  { key: "meaningfulness-prompt", label: "Meaningfulness Prompt" },
  { key: "cropping-prompt", label: "Cropping Prompt" },
  { key: "segmentation-prompt", label: "Segmentation Prompt" },
  { key: "book-summary-prompt", label: "Summary Prompt" },
]

const STORYBOARD_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "sectioning-prompt", label: "Sectioning Mode" },
  { key: "rendering-prompt", label: "AI Rendering" },
  { key: "rendering-template", label: "Template Rendering" },
  { key: "activity-prompts", label: "Activity Rendering" },
  { key: "image-generation", label: "Image Generation" },
]

const QUIZ_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "prompt", label: "Quiz Prompt" },
]

const GLOSSARY_SETTINGS_TABS = [
  { key: "general", label: "Glossary Prompt" },
]

const CAPTIONS_SETTINGS_TABS = [
  { key: "general", label: "Caption Prompt" },
]

const TRANSLATIONS_SETTINGS_TABS = [
  { key: "general", label: "Languages" },
  { key: "prompt", label: "Translation Prompt" },
  { key: "speech", label: "Speech" },
  { key: "speech-prompts", label: "Speech Prompts" },
  { key: "voices", label: "Voices" },
]

const SETTINGS_TABS: Record<string, { key: string; label: string }[]> = {
  extract: EXTRACT_SETTINGS_TABS,
  storyboard: STORYBOARD_SETTINGS_TABS,
  quizzes: QUIZ_SETTINGS_TABS,
  glossary: GLOSSARY_SETTINGS_TABS,
  captions: CAPTIONS_SETTINGS_TABS,
  "text-and-speech": TRANSLATIONS_SETTINGS_TABS,
}

export function StageSidebar({
  bookLabel,
  activeStep,
  selectedPageId,
  onSelectPage,
  sectionIndex,
  onSelectSection,
}: {
  bookLabel: string
  activeStep: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
  sectionIndex?: number
  onSelectSection?: (index: number) => void
}) {
  const matchRoute = useMatchRoute()
  const search = useSearch({ strict: false }) as { tab?: string }
  const { stageState } = useBookRun()
  const { openSettings } = useSettingsDialog()

  const effectivePagesOpen =
    hasStagePages(activeStep) &&
    stageState(activeStep) === "done"

  const isSettings = !!matchRoute({
    to: "/books/$label/$step/settings",
    params: { label: bookLabel, step: activeStep },
  })
  const activeTab = search.tab ?? "general"

  // The rail collapses (icon-only, hover to expand) only when pages are showing
  // and we're not in settings. Otherwise it's always expanded with labels visible.
  const railCollapsed = effectivePagesOpen && !isSettings
  // When the rail is collapsed, labels/buttons are always in the DOM but clipped
  // by overflow-hidden on the inner panel. This avoids display toggling which
  // would flash before the width transition completes.
  const x = {
    gap:       "gap-2.5",
    showLabel: "inline",
    showFlex:  "flex",
    flex1:     "flex-1",
  }

  const stageItems = STAGES.map((step, index) => {
    const isActive = step.slug === activeStep
    const Icon = step.icon
    const settingsTabs = SETTINGS_TABS[step.slug]
    const showSubTabs = isActive && isSettings && !!settingsTabs
    const state = stageState(step.slug)
    const stageCompleted = state === "done"
    const ringState = state

    return (
      <div key={step.slug} className="relative">
        {/* Connector line */}
        {index < STAGES.length - 1 && (
          <div className="absolute left-[24px] top-[36px] bottom-[-10px] w-0.5 bg-border z-10" />
        )}

        {/* Step row */}
        <div
          className={cn(
            "group/row flex items-center py-2 text-sm transition-colors overflow-hidden",
            x.gap,
            isActive
              ? cn(step.color, "text-white font-medium rounded-l-[14px] ml-0.5 pl-2 pr-2.5")
              : "text-muted-foreground hover:text-foreground hover:bg-muted px-2.5"
          )}
        >
          <Link
            to={selectedPageId && hasStagePages(step.slug) ? "/books/$label/$step/$pageId" : "/books/$label/$step"}
            params={selectedPageId && hasStagePages(step.slug)
              ? { label: bookLabel, step: step.slug, pageId: selectedPageId }
              : { label: bookLabel, step: step.slug }}
            className={cn("flex items-center gap-2.5 min-w-7", x.flex1)}
            title={step.label}
          >
            <div className="relative shrink-0">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full transition-colors",
                  step.slug === "book" || stageCompleted
                    ? isActive
                      ? "bg-white/20 text-white"
                      : cn(step.color, "text-white")
                    : "bg-muted text-muted-foreground ring-1 ring-border"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <StepProgressRing size={28} state={ringState} colorClass={isActive ? "bg-white" : step.color} />
            </div>
            <span className={cn("truncate hidden", x.showLabel)}>
              {step.slug === "book" ? toCamelLabel(bookLabel) : step.label}
            </span>
          </Link>

          {settingsTabs ? (
            <Link
              to="/books/$label/$step/settings"
              params={{ label: bookLabel, step: step.slug }}
              search={{ tab: "general" }}
              title={`${step.label} Settings`}
              className={cn(
                "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors",
                isActive
                  ? "text-white/60 hover:text-white hover:bg-white/20"
                  : "opacity-0 group-hover/row:opacity-100 text-muted-foreground/50 group-hover/row:bg-muted hover:text-foreground hover:bg-muted-foreground/20"
              )}
            >
              <Settings className="w-3.5 h-3.5" />
            </Link>
          ) : step.slug === "book" ? (
            <button
              type="button"
              onClick={openSettings}
              title="API Key Settings"
              className={cn(
                "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer",
                isActive
                  ? "text-white/60 hover:text-white hover:bg-white/20"
                  : "opacity-0 group-hover/row:opacity-100 text-muted-foreground/50 group-hover/row:bg-muted hover:text-foreground hover:bg-muted-foreground/20"
              )}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          ) : step.slug === "preview" ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("adt:repackage"))}
              title="Re-package ADT"
              className={cn(
                "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer",
                isActive
                  ? "text-white/60 hover:text-white hover:bg-white/20"
                  : "opacity-0 group-hover/row:opacity-100 text-muted-foreground/50 group-hover/row:bg-muted hover:text-foreground hover:bg-muted-foreground/20"
              )}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>

        {/* Settings sub-tabs */}
        {showSubTabs && (
          <div className={cn("ml-[42px] mr-2 mt-0.5 mb-1 flex-col gap-0.5 hidden", x.showFlex)}>
            {settingsTabs!.map((tab) => (
              <Button
                key={tab.key}
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  "h-auto justify-start rounded text-xs px-2 py-1 whitespace-nowrap",
                  activeTab === tab.key
                    ? cn(step.textColor, "font-medium", step.bgLight)
                    : "font-normal text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Link
                  to="/books/$label/$step/settings"
                  params={{ label: bookLabel, step: step.slug }}
                  search={{ tab: tab.key }}
                >
                  {tab.label}
                </Link>
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  })

  return (
    <nav className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 min-h-0">
        {/* Stage rail */}
        <div className={cn(
          "shrink-0 relative group/rail",
          railCollapsed ? "w-12" : "flex-1"
        )}>
          <div className={cn(
            "absolute inset-y-0 left-0 flex flex-col bg-background overflow-hidden",
            railCollapsed
              ? "w-12 group-hover/rail:w-[220px] z-20 transition-[width] duration-150 delay-150 group-hover/rail:delay-100 group-hover/rail:shadow-lg"
              : "inset-x-0"
          )}>
            <div className="flex flex-col pt-1.5 pb-2 gap-0.5 flex-1 overflow-y-auto overflow-x-hidden">
              {stageItems}
            </div>
            {/* Right edge — follows the expanding rail */}
            <div className="absolute inset-y-0 right-0 w-px border-r" />
          </div>
        </div>

        {/* Pages panel — only when pages are open and not in settings */}
        {effectivePagesOpen && !isSettings && (
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l">
            <div className="flex-1 overflow-y-auto">
              <PageIndex
                bookLabel={bookLabel}
                activeStep={activeStep}
                selectedPageId={selectedPageId}
                onSelectPage={onSelectPage}
                sectionIndex={sectionIndex}
                onSelectSection={onSelectSection}
              />
            </div>
          </div>
        )}
      </div>

      {/* Export button — fixed at the bottom, outside the expanding rail */}
      <div className="shrink-0 border-t py-2 px-1.5">
        <ExportButton bookLabel={bookLabel} />
      </div>
    </nav>
  )
}

/* ---------- PageIndex ---------- */

function PageIndex({
  bookLabel,
  activeStep,
  selectedPageId,
  onSelectPage,
  sectionIndex,
  onSelectSection,
}: {
  bookLabel: string
  activeStep: string
  selectedPageId?: string
  onSelectPage?: (pageId: string) => void
  sectionIndex?: number
  onSelectSection?: (index: number) => void
}) {
  const { data: pages } = usePages(bookLabel)
  const activeStepDef = STAGES.find((s) => s.slug === activeStep)

  if (!pages?.length) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
        No pages extracted yet
      </div>
    )
  }

  return (
    <div className="flex flex-col py-1">
      {pages.map((page) => {
        const isActive = page.pageId === selectedPageId
        return (
          <PageRow
            key={page.pageId}
            bookLabel={bookLabel}
            page={page}
            isActive={isActive}
            activeStepDef={activeStepDef}
            onSelect={() => onSelectPage?.(page.pageId)}
            sectionIndex={isActive ? sectionIndex : undefined}
            onSelectSection={isActive ? onSelectSection : undefined}
          />
        )
      })}
    </div>
  )
}

/* ---------- PageRow ---------- */

function PageRow({
  bookLabel,
  page,
  isActive,
  activeStepDef,
  onSelect,
  sectionIndex,
  onSelectSection,
}: {
  bookLabel: string
  page: { pageId: string; textPreview: string; pageNumber: number; sectionCount: number; prunedSections?: number[] }
  isActive: boolean
  activeStepDef?: (typeof STAGES)[number]
  onSelect: () => void
  sectionIndex?: number
  onSelectSection?: (index: number) => void
}) {
  const { data, isLoading } = usePageImage(bookLabel, page.pageId)
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState({ top: 0, left: 0 })
  const rowRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!rowRef.current) return
      const rect = rowRef.current.getBoundingClientRect()
      const previewH = 400
      const previewW = 300
      const gap = 20
      const margin = 8
      const top = Math.max(margin, Math.min(rect.top, window.innerHeight - previewH - margin))
      const rightEdge = window.innerWidth - margin
      const rightSideLeft = rect.right + gap
      const leftSideLeft = rect.left - previewW - gap
      const unclampedLeft =
        rightSideLeft + previewW <= rightEdge
          ? rightSideLeft
          : leftSideLeft
      const left = Math.max(margin, Math.min(unclampedLeft, rightEdge - previewW))
      setPreviewPos({ top, left })
      setShowPreview(true)
    }, 600)
  }, [])

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setShowPreview(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const imgSrc = data?.imageBase64 ? `data:image/png;base64,${data.imageBase64}` : null

  const showSections = isActive && page.sectionCount > 1 && onSelectSection

  return (
    <div>
      <button
        ref={rowRef}
        type="button"
        onClick={onSelect}
        className={cn(
          "flex items-start gap-2 px-2 py-1.5 text-left transition-colors w-full",
          isActive
            ? cn(activeStepDef?.bgLight ?? "bg-violet-50", activeStepDef?.textColor ?? "text-violet-600", "font-medium")
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        {isLoading || !imgSrc ? (
          <div className="shrink-0 w-16 h-12 bg-muted rounded ring-1 ring-border" />
        ) : (
          <img
            src={imgSrc}
            alt=""
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
            className="shrink-0 w-16 h-12 rounded object-cover object-center ring-1 ring-border"
          />
        )}
        <div className="flex flex-col gap-0.5 min-w-0 flex-1 pt-0.5">
          <span className="text-[11px] leading-snug line-clamp-2">
            {page.textPreview || "Untitled"}
          </span>
          <span className="text-[9px] font-mono opacity-50 leading-none">
            pg {page.pageNumber}
          </span>
        </div>
        {showPreview && imgSrc && createPortal(
          <div
            className="fixed z-50 pointer-events-none animate-in fade-in duration-150"
            style={{ top: previewPos.top, left: previewPos.left }}
          >
            <img
              src={imgSrc}
              alt=""
              className="h-[400px] w-auto rounded-lg shadow-xl ring-1 ring-border"
            />
          </div>,
          document.body
        )}
      </button>
      {showSections && (
        <div className={cn(
          "flex flex-wrap gap-0.5 px-2 pb-1.5 -mt-0.5",
          activeStepDef?.bgLight ?? "bg-violet-50"
        )}>
          {Array.from({ length: page.sectionCount }, (_, i) => {
            const pruned = page.prunedSections?.includes(i)
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectSection(i)}
                className={cn(
                  "flex items-center justify-center min-w-[18px] h-[18px] px-0.5 rounded text-[9px] font-medium transition-colors",
                  i === (sectionIndex ?? 0)
                    ? cn(activeStepDef?.color ?? "bg-violet-600", pruned ? "text-white/50 line-through" : "text-white")
                    : pruned ? "bg-black/5 text-black/20 line-through hover:bg-black/10 hover:text-black/40" : "bg-black/5 text-black/40 hover:bg-black/10 hover:text-black/60"
                )}
                title={`Section ${i + 1}${pruned ? " (pruned)" : ""}`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------- ExportButton ---------- */

function ExportButton({ bookLabel }: { bookLabel: string }) {
  const exportBook = useExportBook()

  const errorMessage = exportBook.isError
    ? exportBook.error.name === "TimeoutError"
      ? "Export timed out — the book may be too large"
      : exportBook.error.message
    : null

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "w-full h-7 text-xs",
          exportBook.isError
            ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            : "bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100",
        )}
        onClick={() => exportBook.mutate(bookLabel)}
        disabled={exportBook.isPending}
      >
        {exportBook.isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileDown className="mr-1.5 h-3.5 w-3.5" />
        )}
        {exportBook.isError ? "Retry Export" : "Export"}
      </Button>
      {errorMessage && (
        <p className="text-[10px] leading-tight text-red-500 px-0.5">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
