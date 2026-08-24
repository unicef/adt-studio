import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  FileArchive,
  FileCode2,
  FileText,
  Globe,
  Image,
  Puzzle,
  Scissors,
  ShieldCheck,
  Video,
  type LucideIcon,
} from "lucide-react"

import type {
  AdtBundleImportPreview,
  AnyImportPreview,
  ImportPreview,
  PartImportPreview,
} from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { CopyTextButton } from "@/components/import/CopyTextButton"
import { STAGE_DESCRIPTION_MESSAGES, STAGE_LABEL_MESSAGES } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const FEATURE_SLUGS = [
  "storyboard",
  "quizzes",
  "captions",
  "glossary",
  "toc",
  "easy-read",
  "sign-language",
  "translate",
  "speech",
] as const

const FEATURES = FEATURE_SLUGS.map((slug) => {
  const stage = STAGES.find((candidate) => candidate.slug === slug)
  const label = STAGE_LABEL_MESSAGES[slug]
  const description = STAGE_DESCRIPTION_MESSAGES[slug]
  if (!stage || !label || !description) throw new Error(`Missing pipeline stage metadata: ${slug}`)
  return { ...stage, label, description }
})

type ReviewTab = "overview" | "features" | "review"
type DetailsDialog = "validation" | "guide" | null
type TabTransitionPhase = "idle" | "exiting" | "entering"

const TAB_EXIT_DURATION_MS = 120
const TAB_ENTER_DURATION_MS = 180

function previewTitle(preview: AnyImportPreview): string {
  if (isPartImportPreview(preview)) return preview.title ?? preview.sourceLabel
  if (isAdtBundleImportPreview(preview)) return preview.title
  return preview.title ?? preview.label
}

function previewCover(preview: AnyImportPreview): string | null {
  return preview.coverBase64
}

function needsReview(preview: AnyImportPreview, unresolvedActivityCount: number): boolean {
  if (isAdtBundleImportPreview(preview)) {
    return !preview.compatibility.supported || unresolvedActivityCount > 0
  }
  return !isPartImportPreview(preview) && Boolean(preview.validationError)
}

type FeatureStatus = "recovered" | "needs-regeneration" | "available"

/** The API reports what the import will actually produce. A published archive
 * can *use* a feature whose pipeline data cannot be rebuilt from it (Easy Read,
 * quizzes, sign language) — those have to be generated again in Studio, so they
 * must not be presented as carried over. */
function featureStatus(preview: AnyImportPreview, slug: string): FeatureStatus {
  if (isPartImportPreview(preview)) return "available"
  if (isAdtBundleImportPreview(preview)) {
    return preview.featureRecovery?.[slug] ?? "available"
  }
  return (preview as ImportPreview).stages[slug]?.status === "done"
    ? "recovered"
    : "available"
}

function PreviewCover({ preview }: { preview: AnyImportPreview }) {
  const title = previewTitle(preview)
  const cover = previewCover(preview)

  return (
    <aside className="hidden min-h-[390px] flex-col items-center justify-center border-t border-slate-200 bg-slate-50/80 p-6 md:flex md:border-l md:border-t-0">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <Trans>Book cover</Trans>
      </p>
      {cover ? (
        <img
          src={cover.startsWith("data:") ? cover : `data:image/png;base64,${cover}`}
          alt={title}
          className="max-h-[285px] w-full max-w-[190px] rounded-md border border-slate-200 bg-white object-contain shadow-[0_16px_35px_-18px_rgba(15,23,42,0.45)]"
        />
      ) : (
        <div className="flex aspect-[3/4] w-full max-w-[190px] flex-col items-center justify-center gap-3 rounded-md border border-slate-200 bg-white text-center shadow-[0_16px_35px_-18px_rgba(15,23,42,0.35)]">
          <FileText className="h-9 w-9 text-slate-300" />
          <p className="max-w-[14ch] text-xs font-medium leading-relaxed text-slate-500">
            <Trans>No cover available</Trans>
          </p>
        </div>
      )}
      <p className="mt-4 max-w-[210px] text-center text-xs leading-relaxed text-slate-500">
        <Trans>Confirm that this is the publication you want to import.</Trans>
      </p>
    </aside>
  )
}

function TypeBadge({ preview }: { preview: AnyImportPreview }) {
  if (isPartImportPreview(preview)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
        <Scissors className="h-3 w-3" />
        <Trans>Completed book part</Trans>
      </span>
    )
  }
  if (isAdtBundleImportPreview(preview)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
        <FileArchive className="h-3 w-3" />
        <Trans>Exported ADT</Trans>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
      <FileArchive className="h-3 w-3" />
      <Trans>Project backup</Trans>
    </span>
  )
}

function Definition({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  )
}

function OverviewTab({ preview }: { preview: AnyImportPreview }) {
  const { t } = useLingui()

  if (isPartImportPreview(preview)) {
    const pageWindow = preview.range.endPage - preview.range.startPage + 1
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Definition label={<Trans>Pages in part</Trans>} value={pageWindow} />
          <Definition label={<Trans>Page range</Trans>} value={`${preview.range.startPage}–${preview.range.endPage}`} />
          <Definition label={<Trans>Original book</Trans>} value={preview.sourceLabel} />
        </dl>
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <div>
            <p className="text-sm font-semibold"><Trans>A separate project will be created</Trans></p>
            <p className="mt-1 text-xs leading-relaxed text-blue-900">
              <Trans>Work on these pages independently, then export the project to merge it back into the full book.</Trans>
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (isAdtBundleImportPreview(preview)) {
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Definition label={<Trans>Pages</Trans>} value={preview.pageCount} />
          <Definition label={<Trans>Source language</Trans>} value={preview.sourceLanguage.toUpperCase()} />
          <Definition
            label={<Trans>Output languages</Trans>}
            value={preview.outputLanguages.length > 0
              ? preview.outputLanguages.map((language) => language.toUpperCase()).join(", ")
              : t`None`}
          />
        </dl>
        {preview.exportComparisonStatus === "unavailable" ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold"><Trans>Export baseline unavailable</Trans></p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">
                <Trans>This export does not include fingerprints that can prove whether its HTML changed. The published HTML becomes the working source, so review generated features after import.</Trans>
              </p>
            </div>
          </div>
        ) : preview.exportComparisonStatus === "changed" ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold"><Trans>Changes since export detected</Trans></p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">
                <Trans>This book differs from its ADT Studio export baseline. The imported HTML becomes the working source, so review generated features such as Speech after import.</Trans>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold"><Trans>Ready to become a new project</Trans></p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-900">
                <Trans>The imported HTML becomes the working source for editing and feature generation.</Trans>
              </p>
            </div>
          </div>
        )}
        <p className="flex items-center gap-2 text-xs leading-relaxed text-slate-600">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            <span className="font-medium text-slate-800"><Trans>A separate project will be created.</Trans></span>{" "}
            <Trans>Existing projects stay unchanged.</Trans>
          </span>
        </p>
      </div>
    )
  }

  const authors = preview.authors.join(", ")
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Definition label={<Trans>Pages</Trans>} value={preview.pageCount || t`Not available`} />
        <Definition label={<Trans>Language</Trans>} value={preview.languageCode?.toUpperCase() ?? t`Not available`} />
        <Definition label={<Trans>Publisher</Trans>} value={preview.publisher ?? t`Not available`} />
      </dl>
      <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
        <p className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" />{authors || t`Author not listed`}</p>
        <p className="flex items-center gap-2"><Image className="h-4 w-4 text-slate-400" /><Trans>{preview.imageCount} images</Trans></p>
        {preview.videoCount > 0 ? (
          <p className="flex items-center gap-2"><Video className="h-4 w-4 text-slate-400" /><Trans>{preview.videoCount} videos</Trans></p>
        ) : null}
      </div>
      <p className="flex items-center gap-2 text-xs leading-relaxed text-slate-600">
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          <span className="font-medium text-slate-800"><Trans>A separate project will be created.</Trans></span>{" "}
          <Trans>Existing projects stay unchanged.</Trans>
        </span>
      </p>
    </div>
  )
}

function FeaturesTab({ preview }: { preview: AnyImportPreview }) {
  const { i18n } = useLingui()
  const [hasMoreBelow, setHasMoreBelow] = useState(false)
  const scrollArea = useRef<HTMLDivElement>(null)
  const needsRegeneration = FEATURES.some((feature) => (
    featureStatus(preview, feature.slug) === "needs-regeneration"
  ))

  // The grid reflows from one column to three across the breakpoints, so
  // whether anything is actually cut off depends on the rendered height rather
  // than the feature count. Measure it, and keep measuring as the card resizes,
  // so the hint never invites a scroll that does nothing.
  useEffect(() => {
    const area = scrollArea.current
    if (!area) return
    const measure = () => {
      setHasMoreBelow(area.scrollHeight - area.scrollTop - area.clientHeight > 4)
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    for (const child of Array.from(area.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative h-full">
      <div
        ref={scrollArea}
        role="region"
        aria-labelledby="import-review-tab-features"
        tabIndex={0}
        className="h-full overflow-y-auto pb-10 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        onScroll={(event) => {
          const area = event.currentTarget
          setHasMoreBelow(area.scrollHeight - area.scrollTop - area.clientHeight > 4)
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="text-xs leading-relaxed text-slate-600">
            {needsRegeneration ? (
              <Trans>Included features carry over to the imported book. The others need generating in Studio.</Trans>
            ) : (
              <Trans>Included features carry over to the imported book. Missing features can be generated in Studio.</Trans>
            )}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((feature) => {
            const status = featureStatus(preview, feature.slug)
            const Icon = feature.icon
            return (
              <div key={feature.slug} className="flex min-h-[96px] items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", feature.bgLight, feature.borderColor, feature.textColor)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    <p className="min-w-0 break-words text-sm font-semibold leading-tight text-slate-900">{i18n._(feature.label)}</p>
                    <span className={cn(
                      "inline-flex max-w-full whitespace-normal break-words rounded-full px-2 py-0.5 text-left text-[10px] font-semibold leading-tight transition-colors duration-200",
                      status === "recovered"
                        ? `${feature.bgLight} ${feature.textColor}`
                        : status === "needs-regeneration"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500",
                    )}>
                      {status === "recovered" ? (
                        <Trans>Included</Trans>
                      ) : status === "needs-regeneration" ? (
                        <Trans>Needs regenerating</Trans>
                      ) : (
                        <Trans>Available</Trans>
                      )}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    {status === "needs-regeneration"
                      ? <Trans>The source publication uses this, but its editable data is not in the archive.</Trans>
                      : i18n._(feature.description)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {hasMoreBelow ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-white via-white/95 to-transparent pb-1.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
            <Trans>Scroll to see all features</Trans>
            <ChevronDown className="h-3 w-3" />
          </span>
        </div>
      ) : null}
    </div>
  )
}

function ValidationDialog({
  preview,
  open,
  onOpenChange,
}: {
  preview: AnyImportPreview
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const issues = isAdtBundleImportPreview(preview) ? preview.compatibility.issues : []
  const projectError = !isPartImportPreview(preview) && !isAdtBundleImportPreview(preview)
    ? preview.validationError
    : null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader>
          <DialogTitle><Trans>Validation details</Trans></DialogTitle>
          <DialogDescription>
            <Trans>Use these file paths and issue codes when repairing the archive.</Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto rounded-lg border border-slate-200">
          {projectError ? (
            <p className="break-words p-4 font-mono text-xs leading-relaxed text-slate-700">{projectError}</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {issues.map((issue, index) => (
                <li key={`${issue.code}:${issue.pageHref}:${index}`} className="grid gap-1 p-4 text-xs sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)_auto] sm:gap-4">
                  <span className="font-mono font-semibold text-slate-900">{issue.pageHref}</span>
                  <span className="break-words text-slate-600">{issue.detail ?? issue.code}</span>
                  <code className="text-[10px] text-slate-500">{issue.code}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GuideDialog({
  preview,
  open,
  onOpenChange,
}: {
  preview: AdtBundleImportPreview
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader>
          <DialogTitle><Trans>AI repair guide</Trans></DialogTitle>
          <DialogDescription>
            <Trans>Open the unzipped archive in an AI coding assistant and use the current ADT Studio editing rules.</Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <CopyTextButton value={preview.agentGuide.repairPrompt}>
            <Trans>Copy repair request</Trans>
          </CopyTextButton>
          {preview.agentGuide.status !== "current" ? (
            <CopyTextButton value={preview.agentGuide.currentGuide}>
              <Trans>Copy current guide</Trans>
            </CopyTextButton>
          ) : null}
        </div>
        <pre className="min-h-0 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-[11px] leading-relaxed text-slate-100">
          <code>{preview.agentGuide.currentGuide}</code>
        </pre>
      </DialogContent>
    </Dialog>
  )
}

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
