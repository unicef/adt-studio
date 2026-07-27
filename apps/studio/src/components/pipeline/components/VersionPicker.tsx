import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  BookOpen,
  Check,
  ChevronDown,
  GitCompareArrows,
  HelpCircle,
  Image as ImageIcon,
  Languages,
  List,
  Loader2,
  type LucideIcon,
} from "lucide-react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { useLingui } from "@lingui/react/macro"
import { useQueryClient } from "@tanstack/react-query"
import { STEP_TO_STAGE, type StageName } from "@adt/types"
import { api } from "@/api/client"
import type { VersionEntry } from "@/api/client"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { STAGES } from "../stage-config"
import { useFloatingSave, PendingChip } from "./floating-save"
import { LazyThumb, PreviewSkeleton } from "./LazyThumb"
import {
  VersionCompareDialog,
  countChanges,
  type VersionDiffDescriptor,
} from "./VersionCompareDialog"
import { VersionPreviewCompareDialog } from "./VersionPreviewCompareDialog"

const NEUTRAL_ACCENT = "#4b5563"

export type VersionedStep =
  | "toc-generation"
  | "glossary"
  | "quiz-generation"
  | "text-catalog-translation"
  | "image-filtering"
  | "image-captioning"
  | "page-sectioning"
  | "web-rendering"

type Variant = "header" | "muted"

interface StepStyling {
  variant: Variant
  triggerClass: string
}

const HEADER_TRIGGER = "bg-white/20 text-white hover:bg-white/30"
const MUTED_TRIGGER = "bg-muted hover:bg-muted/80"

const STEP_STYLING: Record<VersionedStep, StepStyling> = {
  "toc-generation": { variant: "header", triggerClass: HEADER_TRIGGER },
  glossary: { variant: "header", triggerClass: HEADER_TRIGGER },
  "quiz-generation": { variant: "header", triggerClass: HEADER_TRIGGER },
  "text-catalog-translation": { variant: "header", triggerClass: HEADER_TRIGGER },
  "web-rendering": { variant: "header", triggerClass: HEADER_TRIGGER },
  "image-filtering": { variant: "muted", triggerClass: MUTED_TRIGGER },
  "image-captioning": { variant: "muted", triggerClass: MUTED_TRIGGER },
  "page-sectioning": { variant: "muted", triggerClass: MUTED_TRIGGER },
}

/** Default pending-change descriptor shown in the floating save bar per step. */
const STEP_PENDING: Partial<
  Record<VersionedStep, { icon: LucideIcon; label: MessageDescriptor }>
> = {
  "toc-generation": { icon: List, label: msg`Table of contents` },
  glossary: { icon: BookOpen, label: msg`Glossary` },
  "quiz-generation": { icon: HelpCircle, label: msg`Quizzes` },
  "text-catalog-translation": { icon: Languages, label: msg`Translation` },
  "image-filtering": { icon: ImageIcon, label: msg`Image selection` },
  "image-captioning": { icon: ImageIcon, label: msg`Captions` },
}

interface VersionPickerProps {
  step: VersionedStep
  itemId: string
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
  /**
   * Called after a version is restored (pointer moved) so the parent can
   * refresh derived UI / clear any pending local edits. When provided, picking
   * a version performs a real restore (rollback) instead of the legacy
   * preview-as-pending-edit flow.
   */
  onRestored?: () => void
  /** Legacy: load a version's data as a pending edit. Used by steps not yet
   *  migrated to restore (onRestored). Ignored when onRestored is set. */
  onPreview?: (data: unknown) => void
  onSave?: () => void
  onDiscard: () => void
  saveDisabledReason?: string
  /**
   * Whether this picker contributes its dirty state to the shared
   * FloatingSaveBar (via the floating-save registry). Defaults to true. Set
   * false for views that register their own combined entry (e.g. the storyboard
   * section editor, which tracks multiple pending states under one bar). The
   * picker never falls back to inline Save/Discard buttons — Save/Discard
   * always live in the floating bar.
   */
  renderSaveBar?: boolean
  /**
   * Detail shown in the floating save bar (a PendingChip or chips). Overrides
   * the default per-step chip — use it to add context like a page number.
   */
  pendingLabel?: ReactNode
  /** Primitive that changes when pendingLabel content changes. */
  pendingLabelKey?: string
  /**
   * Renders a version's stored data as read-only visible content (scaling to
   * fit its container). When provided, the picker shows a thumbnail chip per
   * version plus a larger preview of the hovered version, instead of a plain
   * text list — used by steps whose content has a rendered form (e.g.
   * storyboard rendering). `onReady` fires once the content has loaded (drives
   * the loading skeletons).
   */
  renderPreview?: (data: unknown, onReady?: () => void) => ReactNode
  /**
   * Book-level list stages (glossary, TOC, quizzes, …) supply this instead of
   * renderPreview: the picker then shows a per-version change count vs the
   * current version and a Compare button that opens an item-level diff dialog.
   */
  diff?: VersionDiffDescriptor
}

export function VersionPicker({
  step,
  itemId,
  currentVersion,
  saving,
  dirty,
  bookLabel,
  onRestored,
  onPreview,
  onSave,
  onDiscard,
  saveDisabledReason,
  renderSaveBar = true,
  pendingLabel,
  pendingLabelKey,
  renderPreview,
  diff,
}: VersionPickerProps) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const styling = STEP_STYLING[step]
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const [restoring, setRestoring] = useState(false)
  // Reserve the first hovered preview's height for later ones so switching
  // versions doesn't grow the flyout from the skeleton up (same page ≈ same
  // height).
  const previewPaneRef = useRef<HTMLDivElement>(null)
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = previewPaneRef.current
    if (!el || hovered == null || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height
      if (h > 40) setPreviewHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hovered])
  const [compareOpen, setCompareOpen] = useState(false)

  const stepPending = STEP_PENDING[step]
  const defaultLabel = stepPending ? (
    <PendingChip icon={stepPending.icon}>{i18n._(stepPending.label)}</PendingChip>
  ) : undefined

  const stage: StageName =
    step === "text-catalog-translation" ? "translate" : STEP_TO_STAGE[step]

  useFloatingSave({
    id: `${step}:${itemId}`,
    stage,
    dirty: dirty && renderSaveBar && currentVersion != null,
    saving,
    label: pendingLabel ?? defaultLabel,
    labelKey: pendingLabelKey ?? step,
    onSave,
    onDiscard,
    saveDisabledReason,
  })

  if (saving || restoring) {
    return (
      <Loader2
        className={`h-3 w-3 animate-spin ${styling.variant === "header" ? "text-white/60" : ""}`}
      />
    )
  }

  if (currentVersion == null) return null

  const stageDef = STAGES.find((s) => s.slug === stage)
  const accentColor = stageDef?.hex ?? NEUTRAL_ACCENT
  const stageIcon = stageDef?.icon ?? GitCompareArrows

  const handleOpenChange = async (next: boolean) => {
    setOpen(next)
    if (next) {
      if (versions == null) setLoadingVersions(true)
      try {
        const res = await api.getVersionHistory(bookLabel, step, itemId, true)
        setVersions(res.versions)
      } finally {
        setLoadingVersions(false)
      }
    }
  }

  // Roll back to an existing version: move the pointer (no new version) and
  // refresh. Shared by the list rows and the compare dialog.
  const restoreTo = async (version: number) => {
    setRestoring(true)
    try {
      await api.restoreVersion(bookLabel, step, itemId, version)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel] })
      onRestored?.()
    } finally {
      setRestoring(false)
    }
  }

  // Pick a version. With onRestored, roll back to it. Otherwise fall back to
  // the legacy pending-edit flow.
  const handlePick = async (v: VersionEntry) => {
    if (v.version === currentVersion) {
      setOpen(false)
      return
    }
    if (!onRestored) {
      setOpen(false)
      onPreview?.(v.data)
      return
    }
    await restoreTo(v.version)
    setOpen(false)
  }

  const currentData = versions?.find((v) => v.version === currentVersion)?.data
  const defaultCompare =
    versions?.find((v) => v.version !== currentVersion)?.version ?? currentVersion

  // Versions come newest-first, so [0] is the highest (latest) version. After a
  // rollback the current pointer can be behind the latest.
  const latestVersion = versions?.[0]?.version ?? currentVersion
  const notAtLatest = currentVersion !== latestVersion
  const currentEntry = versions?.find((v) => v.version === currentVersion)
  const newerThanCurrent = versions?.filter((v) => v.version > currentVersion) ?? []
  const earlierThanCurrent = versions?.filter((v) => v.version < currentVersion) ?? []

  const sectionLabel = (label: string) => (
    <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {label}
    </div>
  )

  // A single thumbnail-chip row in the visual (renderPreview) popover.
  const visualRow = (v: VersionEntry) => {
    const isCurrent = v.version === currentVersion
    const isLatest = v.version === latestVersion
    const isActive = hovered === v.version
    return (
      <button
        key={v.version}
        type="button"
        onClick={() => handlePick(v)}
        onMouseEnter={() => setHovered(v.version)}
        onFocus={() => setHovered(v.version)}
        className={`flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors cursor-pointer ${
          !isCurrent && isActive ? "bg-accent" : !isCurrent ? "hover:bg-accent/60" : ""
        }`}
        style={isCurrent ? { backgroundColor: `${accentColor}0f` } : undefined}
      >
        <div className="w-16 shrink-0 overflow-hidden rounded-md border bg-white">
          <div className="pointer-events-none max-h-14 overflow-hidden">
            <LazyThumb skeletonClassName="h-12">
              <PreviewSkeleton
                reservedClassName="h-12"
                render={(onReady) => renderPreview!(v.data, onReady)}
              />
            </LazyThumb>
          </div>
        </div>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span
            className="text-sm font-semibold"
            style={{ color: isCurrent ? accentColor : undefined }}
          >
            v{v.version}
          </span>
          {isCurrent ? (
            <span
              className="text-[10px] font-medium uppercase tracking-wide"
              style={{ color: accentColor }}
            >
              {t`current`}
            </span>
          ) : (
            isLatest && (
              <span className="text-[10px] text-muted-foreground">{t`latest`}</span>
            )
          )}
        </span>
      </button>
    )
  }

  // A single row in the book (diff) popover — version + change count vs current.
  const diffRow = (v: VersionEntry) => {
    const isCurrent = v.version === currentVersion
    const isLatest = v.version === latestVersion
    const changes = isCurrent || !diff ? 0 : countChanges(diff, currentData, v.data)
    return (
      <button
        key={v.version}
        type="button"
        onClick={() => handlePick(v)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer ${
          isCurrent ? "" : "hover:bg-accent"
        }`}
        style={isCurrent ? { backgroundColor: `${accentColor}0f` } : undefined}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            className="text-sm font-semibold"
            style={{ color: isCurrent ? accentColor : undefined }}
          >
            v{v.version}
          </span>
          {isCurrent ? (
            <span
              className="text-[10px] font-medium uppercase tracking-wide"
              style={{ color: accentColor }}
            >
              {t`current`}
            </span>
          ) : (
            isLatest && (
              <span className="text-[10px] text-muted-foreground">{t`latest`}</span>
            )
          )}
        </span>
        {!isCurrent && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {changes === 1 ? t`1 change` : t`${changes} changes`}
          </span>
        )}
      </button>
    )
  }

  // A3 status line — shared by both popover styles when current isn't latest.
  const notAtLatestBar = notAtLatest ? (
    <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
      <span className="text-[10px] text-muted-foreground">
        {t`On v${currentVersion} · latest is v${latestVersion}`}
      </span>
      <button
        type="button"
        onClick={() => restoreTo(latestVersion)}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-accent cursor-pointer"
        style={{ color: accentColor }}
      >
        {t`Go to latest`}
      </button>
    </div>
  ) : null

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal rounded px-1.5 py-0.5 transition-colors ${styling.triggerClass}`}
          >
            v{currentVersion}
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={`origin-[var(--radix-popover-content-transform-origin)] motion-reduce:animate-none ${
            renderPreview ? "w-56 p-0" : diff ? "w-64 p-0" : "w-auto min-w-[120px] p-1"
          }`}
        >
          {loadingVersions ? (
            <div className="flex items-center justify-center py-3 px-3">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            renderPreview ? (
              <div className="relative flex flex-col">
                <div className="flex items-baseline justify-between border-b px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t`Version history`}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground/70">
                    {versions.length}
                  </span>
                </div>

                {/* A3 — surface where "current" is and offer a jump to latest */}
                {notAtLatestBar}

                {/* A2 — current pinned at the top, always visible */}
                {currentEntry && (
                  <div className="border-b px-1.5 py-1.5">
                    {sectionLabel(t`Current`)}
                    {visualRow(currentEntry)}
                  </div>
                )}

                {/* B2 — the rest grouped relative to current */}
                <div
                  data-thumb-scroll
                  className="max-h-72 overflow-auto p-1.5"
                  onMouseLeave={() => setHovered(null)}
                >
                  {newerThanCurrent.length > 0 && (
                    <>
                      {sectionLabel(t`Newer`)}
                      {newerThanCurrent.map((v) => visualRow(v))}
                    </>
                  )}
                  {earlierThanCurrent.length > 0 && (
                    <>
                      {sectionLabel(t`Earlier`)}
                      {earlierThanCurrent.map((v) => visualRow(v))}
                    </>
                  )}
                </div>

                {/* Floating preview of the hovered version, to the right of the
                    popover. Shown on hover only; animates in from the left edge. */}
                {hovered != null && (
                  <div className="absolute left-full top-0 ml-2 w-[24rem] overflow-hidden rounded-lg border bg-white shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-left-2 duration-200 ease-out motion-reduce:animate-none">
                    <div className="border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                      {t`v${hovered} preview`}
                    </div>
                    <div ref={previewPaneRef} className="max-h-[26rem] overflow-auto">
                      {/* key by version so each switch gets its own loading
                          skeleton instead of flashing an empty frame */}
                      <PreviewSkeleton
                        key={hovered}
                        reservedClassName="h-64"
                        reservedHeight={previewHeight ?? undefined}
                        render={(onReady) =>
                          renderPreview(
                            versions.find((v) => v.version === hovered)?.data,
                            onReady
                          )
                        }
                      />
                    </div>
                  </div>
                )}

                {versions.length > 1 && (
                  <div className="border-t p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        setCompareOpen(true)
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
                    >
                      <GitCompareArrows className="h-3 w-3" />
                      {t`Compare versions`}
                    </button>
                  </div>
                )}
              </div>
            ) : diff ? (
              <div className="flex flex-col">
                <div className="flex items-baseline justify-between border-b px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t`Version history`}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground/70">
                    {versions.length}
                  </span>
                </div>

                {notAtLatestBar}

                {currentEntry && (
                  <div className="border-b px-1.5 py-1.5">
                    {sectionLabel(t`Current`)}
                    {diffRow(currentEntry)}
                  </div>
                )}

                <div className="max-h-64 overflow-auto p-1">
                  {newerThanCurrent.length > 0 && (
                    <>
                      {sectionLabel(t`Newer`)}
                      {newerThanCurrent.map((v) => diffRow(v))}
                    </>
                  )}
                  {earlierThanCurrent.length > 0 && (
                    <>
                      {sectionLabel(t`Earlier`)}
                      {earlierThanCurrent.map((v) => diffRow(v))}
                    </>
                  )}
                </div>
                <div className="border-t px-1.5 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      setCompareOpen(true)
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
                  >
                    <GitCompareArrows className="h-3 w-3" />
                    {t`Compare versions`}
                  </button>
                </div>
              </div>
            ) : (
              versions.map((v) => {
                const isCurrent = v.version === currentVersion
                return (
                  <button
                    key={v.version}
                    type="button"
                    onClick={() => handlePick(v)}
                    className={`flex w-full items-center gap-1.5 text-left px-3 py-1 text-xs rounded hover:bg-accent transition-colors ${
                      isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {isCurrent ? (
                      <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    v{v.version}
                  </button>
                )
              })
            )
          ) : (
            <div className="px-3 py-1 text-xs text-muted-foreground">
              {t`No versions`}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {diff && versions && versions.length > 0 && (
        <VersionCompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          versions={versions}
          currentVersion={currentVersion}
          initialSelected={defaultCompare}
          descriptor={diff}
          accentColor={accentColor}
          icon={stageIcon}
          onRestore={restoreTo}
        />
      )}

      {renderPreview && versions && versions.length > 0 && (
        <VersionPreviewCompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          versions={versions}
          currentVersion={currentVersion}
          initialSelected={defaultCompare}
          renderPreview={renderPreview}
          accentColor={accentColor}
          icon={stageIcon}
          onRestore={restoreTo}
        />
      )}
    </>
  )
}
