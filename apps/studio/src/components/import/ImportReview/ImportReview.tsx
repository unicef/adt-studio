import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, Bot, Check, FileCode2, Puzzle, ShieldCheck } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { CopyTextButton } from "./CopyTextButton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { FeaturesTab } from "./FeaturesTab"
import { OverviewTab } from "./OverviewTab"
import { PreviewCover, TypeBadge } from "./PreviewHeader"
import { GuideDialog, ValidationDialog } from "./ReviewDialogs"
import {
  TAB_ENTER_DURATION_MS,
  TAB_EXIT_DURATION_MS,
  needsReview,
  previewTitle,
  type DetailsDialog,
  type ReviewTab,
  type TabTransitionPhase,
} from "./helpers"

const NOTICE = "flex items-start gap-3 rounded-lg border p-4"
const NOTICE_DANGER = "border-red-400/40 bg-red-500/10 text-red-900 dark:text-red-100"
const NOTICE_WARNING = "border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"

function ReviewTabContent({
  preview,
  unresolvedActivityCount,
  onReviewActivities,
  onOpenDetails,
}: {
  preview: AnyImportPreview
  unresolvedActivityCount: number
  onReviewActivities: () => void
  onOpenDetails: (dialog: Exclude<DetailsDialog, null>) => void
}) {
  if (isAdtBundleImportPreview(preview) && !preview.compatibility.supported) {
    return (
      <div className="space-y-4">
        <div className={cn(NOTICE, NOTICE_DANGER)}>
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="text-sm font-semibold"><Trans>This archive needs repair before import</Trans></p>
            <p className="mt-1 text-xs leading-relaxed text-pretty opacity-85">
              <Trans>ADT Studio found the book, but its HTML or files do not follow the round-trip structure.</Trans>
            </p>
          </div>
        </div>
        <ol className="grid gap-2 sm:grid-cols-3">
          {[
            { number: 1, title: <Trans>Copy instructions</Trans>, body: <Trans>Give the repair request to your AI assistant.</Trans> },
            { number: 2, title: <Trans>Repair and re-zip</Trans>, body: <Trans>Keep the book content, then create a new ZIP.</Trans> },
            { number: 3, title: <Trans>Validate again</Trans>, body: <Trans>Choose the repaired ZIP to run this check again.</Trans> },
          ].map((step, index) => (
            <li
              key={step.number}
              className={cn(
                "rounded-lg border border-border bg-card p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300",
                index === 1 && "motion-safe:delay-100",
                index === 2 && "motion-safe:delay-200",
              )}
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">{step.number}</span>
              <p className="mt-2 text-xs font-semibold text-foreground">{step.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground text-pretty">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {preview.agentGuide ? (
            <CopyTextButton value={preview.agentGuide.repairPrompt}>
              <Trans>Copy repair request</Trans>
            </CopyTextButton>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetails("validation")}>
            <FileCode2 className="size-4" />
            <Trans>Validation details</Trans>
          </Button>
          {preview.agentGuide ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetails("guide")}>
              <Bot className="size-4" />
              <Trans>AI repair guide</Trans>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (isAdtBundleImportPreview(preview) && unresolvedActivityCount > 0) {
    return (
      <div className="space-y-4">
        <div className={cn(NOTICE, NOTICE_WARNING)}>
          <Puzzle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold"><Trans>Review {unresolvedActivityCount} activities before import</Trans></p>
            <p className="mt-1 text-xs leading-relaxed text-pretty opacity-85">
              <Trans>Confirm each activity type so ADT Studio knows how it should behave in the recovered project.</Trans>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onReviewActivities}>
            <Puzzle className="size-4" />
            <Trans>Review activities</Trans>
          </Button>
          {preview.agentGuide?.activityPrompt ? (
            <CopyTextButton value={preview.agentGuide.activityPrompt}>
              <Trans>Copy AI instructions</Trans>
            </CopyTextButton>
          ) : null}
        </div>
      </div>
    )
  }

  if (!isPartImportPreview(preview) && !isAdtBundleImportPreview(preview) && preview.validationError) {
    return (
      <div className="space-y-4">
        <div className={cn(NOTICE, NOTICE_DANGER)}>
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="text-sm font-semibold"><Trans>This project cannot be imported yet</Trans></p>
            <p className="mt-1 text-xs leading-relaxed text-pretty opacity-85"><Trans>Review the validation message, correct the archive, and try again.</Trans></p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetails("validation")}>
          <FileCode2 className="size-4" />
          <Trans>Validation details</Trans>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[170px] items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-6 text-center text-emerald-900 dark:text-emerald-100">
      <div>
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="size-5" />
        </span>
        <p className="mt-3 text-sm font-semibold"><Trans>No action needed</Trans></p>
        <p className="mt-1 text-xs leading-relaxed text-pretty opacity-85"><Trans>This archive passed the checks required for import.</Trans></p>
      </div>
    </div>
  )
}


export function ImportReview({
  preview,
  unresolvedActivityCount,
  onReviewActivities,
}: {
  preview: AnyImportPreview
  unresolvedActivityCount: number
  onReviewActivities: () => void
}) {
  const { t } = useLingui()
  const [detailsDialog, setDetailsDialog] = useState<DetailsDialog>(null)
  const defaultTab: ReviewTab = needsReview(preview, unresolvedActivityCount) ? "review" : "overview"
  const [activeTab, setActiveTab] = useState<ReviewTab>(defaultTab)
  const [displayedTab, setDisplayedTab] = useState<ReviewTab>(defaultTab)
  const [transitionPhase, setTransitionPhase] = useState<TabTransitionPhase>("idle")
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTabRef = useRef<ReviewTab>(defaultTab)

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
  }, [])

  const handleTabChange = (value: string) => {
    const nextTab = value as ReviewTab
    if (nextTab === activeTab) return

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query, not user-visible copy.
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    pendingTabRef.current = nextTab
    setActiveTab(nextTab)
    if (reduceMotion) {
      setDisplayedTab(nextTab)
      setTransitionPhase("idle")
      return
    }

    setTransitionPhase("exiting")
    transitionTimerRef.current = setTimeout(() => {
      setDisplayedTab(pendingTabRef.current)
      setTransitionPhase("entering")
      transitionTimerRef.current = setTimeout(() => {
        setTransitionPhase("idle")
        transitionTimerRef.current = null
      }, TAB_ENTER_DURATION_MS)
    }, TAB_EXIT_DURATION_MS)
  }

  const tabContent = displayedTab === "overview" ? (
    <div className="h-full overflow-y-auto pr-1"><OverviewTab preview={preview} /></div>
  ) : displayedTab === "features" ? (
    <FeaturesTab preview={preview} />
  ) : (
    <div className="h-full overflow-y-auto pr-1">
      <ReviewTabContent
        preview={preview}
        unresolvedActivityCount={unresolvedActivityCount}
        onReviewActivities={onReviewActivities}
        onOpenDetails={setDetailsDialog}
      />
    </div>
  )

  const attention = needsReview(preview, unresolvedActivityCount)

  return (
    <>
      <section className="grid min-h-124 w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-border bg-card shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 md:grid-cols-[minmax(0,1fr)_240px] md:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <TypeBadge preview={preview} />
              <h2 className="mt-2 truncate text-xl font-semibold tracking-[-0.02em] text-foreground">{previewTitle(preview)}</h2>
            </div>
            <Badge variant={attention ? "warning" : "success"} className="gap-1.5 py-1 text-[11px]">
              {attention ? <AlertCircle className="size-3" /> : <Check className="size-3" />}
              {attention ? <Trans>Needs attention</Trans> : <Trans>Ready to import</Trans>}
            </Badge>
          </header>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-3"
          >
            <TabsList aria-label={t`Book import details`} className="grid h-10 w-full shrink-0 grid-cols-3">
              <TabsTrigger id="import-review-tab-overview" aria-controls="import-review-panel" value="overview"><Trans>Overview</Trans></TabsTrigger>
              <TabsTrigger id="import-review-tab-features" aria-controls="import-review-panel" value="features"><Trans>Features</Trans></TabsTrigger>
              <TabsTrigger id="import-review-tab-review" aria-controls="import-review-panel" value="review" className="gap-1.5">
                <Trans>Review</Trans>
                {attention ? <span className="size-1.5 rounded-full bg-amber-500" /> : null}
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                id="import-review-panel"
                role="tabpanel"
                aria-labelledby={`import-review-tab-${displayedTab}`}
                className={cn(
                  "h-full pt-4",
                  transitionPhase === "exiting"
                    && "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:slide-out-to-top-1 motion-safe:duration-[120ms]",
                  transitionPhase === "entering"
                    && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-[180ms]",
                )}
              >
                {tabContent}
              </div>
            </div>
          </Tabs>
        </div>
        <PreviewCover preview={preview} />
      </section>

      <ValidationDialog
        preview={preview}
        open={detailsDialog === "validation"}
        onOpenChange={(open) => setDetailsDialog(open ? "validation" : null)}
      />
      {isAdtBundleImportPreview(preview) && preview.agentGuide ? (
        <GuideDialog
          preview={preview}
          open={detailsDialog === "guide"}
          onOpenChange={(open) => setDetailsDialog(open ? "guide" : null)}
        />
      ) : null}
    </>
  )
}
