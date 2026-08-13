import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  BookOpen,
  Check,
  ChevronDown,
  FileText,
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
import { toast } from "@/components/ui/sonner"
import type { VersionEntry } from "@/api/client"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { STAGES } from "../stage-config"
import { useFloatingSave, PendingChip } from "./floating-save"
import { KIND_TEXT_CLASS } from "./change-summary"
import { LazyThumb, PreviewSkeleton, useReservedHeight } from "./LazyThumb"
import {
  VersionCompareDialog,
  diffCounts,
  type VersionDiffDescriptor,
} from "./VersionCompareDialog"
import {
  VersionPreviewCompareDialog,
  type VersionPreviewRenderOptions,
} from "./VersionPreviewCompareDialog"
import type { PreviewViewport } from "./preview-viewport"

const NEUTRAL_ACCENT = "#4b5563"
const HOVER_PREVIEW_MAX_HEIGHT = 376

export type VersionedStep =
  | "toc-generation"
  | "glossary"
  | "quiz-generation"
  | "text-catalog-translation"
  | "core-tts-catalog"
  | "easy-read"
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
  "core-tts-catalog": { variant: "header", triggerClass: HEADER_TRIGGER },
  "easy-read": { variant: "header", triggerClass: HEADER_TRIGGER },
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
  "easy-read": { icon: FileText, label: msg`Easy Read` },
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
   * the loading skeletons). `opts.lite` requests a cheap render for the tiny
   * list chips (skip per-version Tailwind recompilation / heavy work); the
   * full-fidelity render is used for the hover preview and the compare dialog.
   */
  renderPreview?: (
    data: unknown,
    onReady?: () => void,
    opts?: VersionPreviewRenderOptions
  ) => ReactNode
  /** Initial synchronized viewport for visual comparison. */
  previewViewport?: PreviewViewport
  /** Stage-specific viewport change classifier for compare indicators. */
  getChangedPreviewViewports?: (
    currentData: unknown,
    selectedData: unknown
  ) => ReadonlySet<PreviewViewport>
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
  previewViewport,
  getChangedPreviewViewports,
  diff,
}: VersionPickerProps) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const styling = STEP_STYLING[step]
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [hoverCandidate, setHoverCandidate] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [loadError, setLoadError] = useState(false)
  // Reserve the first hovered preview's height for later ones so switching
  // versions doesn't grow the flyout from the skeleton up (same page ≈ same
  // height).
  const [previewPaneRef, previewHeight] = useReservedHeight<HTMLDivElement>(hovered != null)
  const [compareOpen, setCompareOpen] = useState(false)

  // Full storyboard previews trigger a Tailwind compilation. Delay mounting
  // until the pointer settles so moving across the version list does not start
  // one expensive request per row.
  useEffect(() => {
    if (hoverCandidate == null) {
      setHovered(null)
      return
    }
    const timer = window.setTimeout(() => setHovered(hoverCandidate), 180)
    return () => window.clearTimeout(timer)
  }, [hoverCandidate])

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

  // Per-kind change counts vs current, precomputed once per version set (avoids
  // an O(versions × items) diff on every render while the popover is open).
  // Must stay above the early returns below so hook order is stable. `diff` is
  // intentionally not a dep: callers pass it as an inline object (new identity
  // each render) but its logic is structurally constant, so keying on the
  // version set is both correct and actually memoizes.
  const changeCounts = useMemo(() => {
    if (!diff || !versions) return null
    const currentData = versions.find((v) => v.version === currentVersion)?.data
    const m = new Map<number, { added: number; edited: number; removed: number; total: number }>()
    for (const v of versions) {
      if (v.version !== currentVersion) m.set(v.version, diffCounts(diff, currentData, v.data))
    }
    return m
  }, [versions, currentVersion])

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
    setHoverCandidate(null) // don't carry a stale hover-preview across open/close
    setHovered(null)
    if (next) {
      if (versions == null) setLoadingVersions(true)
      setLoadError(false)
      try {
        const res = await api.getVersionHistory(bookLabel, step, itemId, true)
        setVersions(res.versions)
      } catch {
        setLoadError(true)
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
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel] }),
      ]
      if (step === "text-catalog-translation") {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ["evaluations", "translations", bookLabel, itemId],
          })
        )
      }
      await Promise.all(invalidations)
      onRestored?.()
      toast.success(t`Restored to v${version}`)
    } catch {
      // Never throw to callers (they close popovers/dialogs after this) — a
      // failed restore surfaces as a toast, not an unhandled rejection.
      toast.error(t`Couldn't restore v${version}. Please try again.`)
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
    setOpen(false)
    void restoreTo(v.version)
  }

  const defaultCompare =
    versions?.find((v) => v.version !== currentVersion)?.version ?? currentVersion

  // Versions come newest-first, so [0] is the highest (latest) version. After a
  // rollback the current pointer can be behind the latest.
  const latestVersion = versions?.[0]?.version ?? currentVersion
  const notAtLatest = currentVersion !== latestVersion
  const currentEntry = versions?.find((v) => v.version === currentVersion)
  const otherVersions = versions?.filter((v) => v.version !== currentVersion) ?? []

  const sectionLabel = (label: string) => (
    <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {label}
    </div>
  )

  // A single thumbnail-chip row in the visual (renderPreview) popover.
  const visualRow = (v: VersionEntry) => {
    const isCurrent = v.version === currentVersion
    const isActive = hoverCandidate === v.version
    return (
      <button
        key={v.version}
        type="button"
        onClick={() => handlePick(v)}
        onMouseEnter={() => setHoverCandidate(v.version)}
        onFocus={() => setHoverCandidate(v.version)}
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
                render={(onReady) => renderPreview!(v.data, onReady, { lite: true })}
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
          {isCurrent && (
            <span
              className="text-[10px] font-medium uppercase tracking-wide"
              style={{ color: accentColor }}
            >
              {t`current`}
            </span>
          )}
        </span>
      </button>
    )
  }

  // A single row in the book (diff) popover — version + a colored +added /
  // ~edited / −removed breakdown so the nature of the change reads at a glance.
  const diffRow = (v: VersionEntry) => {
    const isCurrent = v.version === currentVersion
    const b = isCurrent ? null : changeCounts?.get(v.version)
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
          {isCurrent && (
            <span
              className="text-[10px] font-medium uppercase tracking-wide"
              style={{ color: accentColor }}
            >
              {t`current`}
            </span>
          )}
        </span>
        {b &&
          (b.total === 0 ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">{t`no changes`}</span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tabular-nums">
              {b.added > 0 && <span className={KIND_TEXT_CLASS.added}>+{b.added}</span>}
              {b.edited > 0 && <span className={KIND_TEXT_CLASS.edited}>~{b.edited}</span>}
              {b.removed > 0 && <span className={KIND_TEXT_CLASS.removed}>−{b.removed}</span>}
            </span>
          ))}
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
        onClick={() => {
          setOpen(false)
          void restoreTo(latestVersion)
        }}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-accent cursor-pointer"
        style={{ color: accentColor }}
      >
        {t`Go to latest`}
      </button>
    </div>
  ) : null

  // Shared rich-popover layout (header + not-at-latest bar + pinned current +
  // scrollable list + Compare button). Visual and book modes differ only in the
  // row renderer, the scroll container, and an optional hover overlay.
  const richPopover = (
    rowFn: (v: VersionEntry) => ReactNode,
    opts: { scrollClassName: string; scrollProps?: Record<string, unknown>; overlay?: ReactNode }
  ) => (
    <div className="relative flex flex-col">
      <div className="flex items-baseline justify-between border-b px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t`Version history`}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">
          {versions?.length ?? 0}
        </span>
      </div>

      {/* A3 — surface where "current" is and offer a jump to latest */}
      {notAtLatestBar}

      {/* A2 — current pinned at the top, always visible */}
      {currentEntry && (
        <div className="border-b px-1.5 py-1.5">
          {sectionLabel(t`Current`)}
          {rowFn(currentEntry)}
        </div>
      )}

      <div className={opts.scrollClassName} {...opts.scrollProps}>
        {otherVersions.map((v) => rowFn(v))}
      </div>

      {opts.overlay}

      {(versions?.length ?? 0) > 1 && (
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
  )

  // Loading skeleton that mirrors the loaded layout (header + a pinned current
  // row + a few list rows + the compare button), so the popover keeps its shape
  // and the reveal doesn't jump. Row shape matches the active mode: a thumbnail
  // + label for visual, a version + change-count pill for book/diff, or plain
  // rows for the simple list.
  const rich = Boolean(renderPreview || diff)
  const skeletonRow = (key: number) =>
    renderPreview ? (
      <div key={key} className="flex w-full items-center gap-2.5 p-1.5">
        <div className="h-12 w-16 shrink-0 rounded-md bg-muted" />
        <div className="h-3 w-10 rounded bg-muted" />
      </div>
    ) : (
      <div key={key} className="flex w-full items-center justify-between px-2 py-2">
        <div className="h-3 w-10 rounded bg-muted" />
        <div className="h-4 w-14 rounded-full bg-muted" />
      </div>
    )
  const loadingState = (
    <div role="status" aria-busy className="motion-safe:animate-pulse">
      <span className="sr-only">{t`Loading versions…`}</span>
      {rich ? (
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <div className="h-2.5 w-24 rounded bg-muted" />
            <div className="h-2.5 w-3 rounded bg-muted" />
          </div>
          <div className="border-b px-1.5 py-1.5">
            <div className="px-1 pb-1.5 pt-1">
              <div className="h-2 w-12 rounded bg-muted/70" />
            </div>
            {skeletonRow(0)}
          </div>
          <div className="space-y-0.5 p-1.5">{[1, 2, 3].map(skeletonRow)}</div>
          <div className="border-t p-1.5">
            <div className="h-8 w-full rounded-md bg-muted" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 w-full rounded bg-muted" />
          ))}
        </div>
      )}
    </div>
  )

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
            loadingState
          ) : loadError && !versions ? (
            <div className="flex flex-col items-center gap-1.5 px-3 py-3 text-center">
              <span className="text-xs text-muted-foreground">
                {t`Couldn't load versions.`}
              </span>
              <button
                type="button"
                onClick={() => handleOpenChange(true)}
                className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-accent cursor-pointer"
                style={{ color: accentColor }}
              >
                {t`Retry`}
              </button>
            </div>
          ) : versions && versions.length > 0 ? (
            renderPreview ? (
              richPopover(visualRow, {
                scrollClassName: "max-h-72 overflow-auto p-1.5",
                scrollProps: {
                  "data-thumb-scroll": true,
                  onMouseLeave: () => setHoverCandidate(null),
                },
                overlay:
                  hovered != null ? (
                    <div className="absolute left-full top-0 ml-2 w-[24rem] overflow-hidden rounded-lg border bg-white shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-left-2 duration-200 ease-out motion-reduce:animate-none">
                      <div className="border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                        {t`v${hovered} preview`}
                      </div>
                      <div
                        ref={previewPaneRef}
                        className="max-h-[26rem] overflow-hidden bg-muted/20 p-3"
                      >
                        {/* key by version so each switch gets its own loading
                            skeleton instead of flashing an empty frame */}
                        <PreviewSkeleton
                          key={hovered}
                          reservedClassName="h-64"
                          reservedHeight={previewHeight ?? undefined}
                          render={(onReady) =>
                            renderPreview(
                              versions.find((v) => v.version === hovered)?.data,
                              onReady,
                              {
                                viewport: previewViewport,
                                maxHeight: HOVER_PREVIEW_MAX_HEIGHT,
                              }
                            )
                          }
                        />
                      </div>
                    </div>
                  ) : null,
              })
            ) : diff ? (
              richPopover(diffRow, { scrollClassName: "max-h-64 overflow-auto p-1" })
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

      {/* Visual takes precedence if both were somehow supplied, so only one
          compare dialog can ever open. */}
      {versions && versions.length > 0 && renderPreview ? (
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
          cacheKey={`${bookLabel}:${step}:${itemId}`}
          initialViewport={previewViewport}
          getChangedViewports={getChangedPreviewViewports}
        />
      ) : versions && versions.length > 0 && diff ? (
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
      ) : null}
    </>
  )
}
