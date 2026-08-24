import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, Bot, Check, FileCode2, Puzzle, ShieldCheck } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { CopyTextButton } from "./CopyTextButton"
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
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-950">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold"><Trans>This archive needs repair before import</Trans></p>
            <p className="mt-1 text-xs leading-relaxed text-red-900">
              <Trans>ADT Studio found the book, but its HTML or files do not follow the round-trip structure.</Trans>
            </p>
          </div>
        </div>
        <ol className="grid gap-2 sm:grid-cols-3">
          {[
            { number: 1, title: <Trans>Copy instructions</Trans>, body: <Trans>Give the repair request to your AI assistant.</Trans> },
            { number: 2, title: <Trans>Repair and re-zip</Trans>, body: <Trans>Keep the book content, then create a new ZIP.</Trans> },
            { number: 3, title: <Trans>Validate again</Trans>, body: <Trans>Choose the repaired ZIP to run this check again.</Trans> },
          ].map((step) => (
            <li key={step.number} className="rounded-lg border border-slate-200 bg-white p-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{step.number}</span>
              <p className="mt-2 text-xs font-semibold text-slate-900">{step.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{step.body}</p>
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
            <FileCode2 className="h-4 w-4" />
            <Trans>Validation details</Trans>
          </Button>
          {preview.agentGuide ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetails("guide")}>
              <Bot className="h-4 w-4" />
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
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <Puzzle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold"><Trans>Review {unresolvedActivityCount} activities before import</Trans></p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              <Trans>Confirm each activity type so ADT Studio knows how it should behave in the recovered project.</Trans>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onReviewActivities}>
            <Puzzle className="h-4 w-4" />
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
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-950">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold"><Trans>This project cannot be imported yet</Trans></p>
            <p className="mt-1 text-xs leading-relaxed text-red-900"><Trans>Review the validation message, correct the archive, and try again.</Trans></p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetails("validation")}>
          <FileCode2 className="h-4 w-4" />
          <Trans>Validation details</Trans>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[170px] items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
      <div>
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-semibold text-emerald-950"><Trans>No action needed</Trans></p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-900"><Trans>This archive passed the checks required for import.</Trans></p>
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

  return (
    <>
      <section className="grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 md:grid-cols-[minmax(0,1fr)_240px] md:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <TypeBadge preview={preview} />
              <h2 className="mt-2 truncate text-xl font-semibold tracking-[-0.02em] text-slate-950">{previewTitle(preview)}</h2>
            </div>
            {needsReview(preview, unresolvedActivityCount) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                <AlertCircle className="h-3 w-3" />
                <Trans>Needs attention</Trans>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
                <Check className="h-3 w-3" />
                <Trans>Ready to import</Trans>
              </span>
            )}
          </header>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-3"
          >
            <TabsList aria-label={t`Book import details`} className="grid h-10 w-full shrink-0 grid-cols-3 bg-slate-100">
              <TabsTrigger id="import-review-tab-overview" aria-controls="import-review-panel" value="overview"><Trans>Overview</Trans></TabsTrigger>
              <TabsTrigger id="import-review-tab-features" aria-controls="import-review-panel" value="features"><Trans>Features</Trans></TabsTrigger>
              <TabsTrigger id="import-review-tab-review" aria-controls="import-review-panel" value="review" className="gap-1.5">
                <Trans>Review</Trans>
                {needsReview(preview, unresolvedActivityCount) ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
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
