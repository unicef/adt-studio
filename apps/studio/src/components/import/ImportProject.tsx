import { useCallback, useRef, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Upload,
  Loader2,
  Trash2,
  FileText,
  Image,
  Video,
  Globe,
  Building2,
  BookOpen,
  AlertCircle,
  Scissors,
  FileArchive,
  Check,
  Puzzle,
  type LucideIcon,
} from "lucide-react"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Button } from "@/components/ui/button"
import { ActivityClassificationDialog } from "@/components/import/ActivityClassificationDialog"
import { AdtImportRepairPanel } from "@/components/import/AdtImportRepairPanel"
import { FileDropOverlay, useFileDropZone } from "@/components/ui/file-drop-overlay"
import { STAGES } from "@/components/pipeline/stage-config"
import { cn, formatBytes, isZipFile } from "@/lib/utils"
import { useImportAdtProject, useImportBook } from "@/hooks/use-books"
import { useFriendlyArchiveError, type FriendlyError } from "@/hooks/use-archive-error"
import { api, isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import type { AdtBundleImportPreview, AnyImportPreview, ImportPreview, PartImportPreview } from "@/api/client"

const FEATURE_STAGE_LABELS = {
  storyboard: msg`Storyboard`,
  quizzes: msg`Quizzes`,
  captions: msg`Image Captions`,
  glossary: msg`Glossary`,
  toc: msg`Table of Contents`,
  "easy-read": msg`Easy Read`,
  "sign-language": msg`Sign Language`,
  translate: msg`Language`,
  speech: msg`Speech`,
} as const

const FEATURE_STAGES: {
  name: string
  label: MessageDescriptor
  icon: LucideIcon
  textColor: string
  bgLight: string
  borderColor: string
}[] = Object.entries(FEATURE_STAGE_LABELS).map(([name, label]) => {
  const stage = STAGES.find((candidate) => candidate.slug === name)
  if (!stage) throw new Error(`Missing pipeline stage metadata: ${name}`)
  return {
    name,
    label,
    icon: stage.icon,
    textColor: stage.textColor,
    bgLight: stage.bgLight,
    borderColor: stage.borderColor,
  }
})

const EMPTY_ACTIVITY_REVIEW: AdtBundleImportPreview["activityReview"] = {
  inventoryVersion: null,
  items: [],
  needsReviewCount: 0,
  quizCount: 0,
  activityCount: 0,
  typeOptions: [],
}

function FeatureChip({
  icon: Icon,
  label,
  textColor,
  bgLight,
  borderColor,
  done,
}: {
  icon: LucideIcon
  label: string
  textColor: string
  bgLight: string
  borderColor: string
  done: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
        done
          ? `${bgLight} ${borderColor} ${textColor}`
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </span>
  )
}

type ImportPhase = "select" | "reading" | "review" | "importing"

function ImportProgress({
  phase,
  hasPreviewError,
  hasImportError,
}: {
  phase: ImportPhase
  hasPreviewError: boolean
  hasImportError: boolean
}) {
  const { t } = useLingui()
  const activeIndex = phase === "select" ? 0 : phase === "reading" || phase === "review" ? 1 : 2
  const steps = [t`Select archive`, t`Review details`, t`Import project`]

  return (
    <ol aria-label={t`Import progress`} className="mx-auto mt-5 flex w-full max-w-xl items-start">
      {steps.map((label, index) => {
        const complete = index < activeIndex
        const current = index === activeIndex
        const failed = (hasPreviewError && index === 1) || (hasImportError && index === 2)
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-2 text-center">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-1/2 top-3 h-px w-full transition-colors duration-150",
                  complete ? "bg-amber-700" : "bg-slate-200",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors duration-150",
                failed
                  ? "border-red-500 bg-red-50 text-red-600"
                  : complete
                    ? "border-amber-700 bg-amber-700 text-white"
                    : current
                      ? "border-amber-700 bg-white text-amber-700 ring-4 ring-amber-100"
                      : "border-slate-300 bg-white text-slate-400",
              )}
              aria-current={current ? "step" : undefined}
            >
              {failed ? (
                <>
                  <AlertCircle aria-hidden="true" className="h-3 w-3" />
                  <span className="sr-only"><Trans>Failed</Trans></span>
                </>
              ) : complete ? (
                <>
                  <Check aria-hidden="true" className="h-3 w-3" />
                  <span className="sr-only"><Trans>Completed</Trans></span>
                </>
              ) : index + 1}
            </span>
            <span className={cn(
              "relative z-10 whitespace-nowrap text-xs",
              current || complete ? "font-medium text-slate-800" : "text-slate-500",
              failed && "font-medium text-red-700",
            )}>
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ImportStatus({
  phase,
  error,
  rawError,
  isUnsupported,
}: {
  phase: ImportPhase
  error: FriendlyError | null
  rawError: string | null
  isUnsupported: boolean
}) {
  const content = error
    ? {
        tone: "error" as const,
        title: error.title,
        hint: error.hint,
      }
    : isUnsupported
      ? {
          tone: "error" as const,
          title: <Trans>Unsupported ADT structure</Trans>,
          hint: <Trans>This publication cannot be imported because its HTML does not follow the ADT Studio round-trip pattern.</Trans>,
        }
    : phase === "reading"
      ? {
          tone: "progress" as const,
          title: <Trans>Reading the archive</Trans>,
          hint: <Trans>Checking its format, publication details, and compatibility.</Trans>,
        }
      : phase === "review"
        ? {
            tone: "ready" as const,
            title: <Trans>Archive ready to review</Trans>,
            hint: null,
          }
        : phase === "importing"
          ? {
              tone: "progress" as const,
              title: <Trans>Importing the project</Trans>,
              hint: <Trans>Saving the archive and preparing the book workspace. Keep this window open.</Trans>,
            }
          : {
              tone: "neutral" as const,
              title: <Trans>Choose an archive to begin</Trans>,
              hint: <Trans>Use a project ZIP, a completed book part, or an exported ADT Web ZIP.</Trans>,
            }

  const Icon = content.tone === "error"
    ? AlertCircle
    : content.tone === "progress"
      ? Loader2
      : content.tone === "ready"
        ? Check
        : FileArchive

  return (
    <div className="min-h-[62px]" aria-live="polite">
      <div key={`${phase}:${content.tone}`} className={cn(
        "flex min-h-[56px] items-start gap-3 rounded-lg border px-4 py-2.5 transition-colors duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200",
        content.tone === "error" && "border-red-200 bg-red-50 text-red-800",
        content.tone === "progress" && "border-blue-200 bg-blue-50 text-blue-900",
        content.tone === "ready" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        content.tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-800",
      )}>
        <Icon className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          content.tone === "error" && "text-red-500",
          content.tone === "progress" && "animate-spin text-blue-600 motion-reduce:animate-none",
          content.tone === "ready" && "text-emerald-600",
          content.tone === "neutral" && "text-slate-500",
        )} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{content.title}</p>
          {content.hint ? (
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed opacity-80">{content.hint}</p>
          ) : null}
          {error && rawError ? (
            <details className="mt-1.5 text-xs">
              <summary className="cursor-pointer font-medium underline underline-offset-2">
                <Trans>Show error details</Trans>
              </summary>
              <p className="mt-1 break-words font-mono text-[11px] leading-relaxed opacity-80">{rawError}</p>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ArchiveReviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid min-h-[400px] w-full grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-[minmax(0,1.7fr)_minmax(220px,0.8fr)]"
    >
      <div className="space-y-6 p-6 motion-safe:animate-pulse">
        <div className="space-y-3">
          <div className="h-5 w-24 rounded bg-slate-100" />
          <div className="h-6 w-1/2 rounded bg-slate-200" />
          <div className="h-3 w-1/3 rounded bg-slate-100" />
        </div>
        <div className="h-20 rounded-lg bg-slate-100" />
        <div className="h-36 rounded-lg bg-slate-100" />
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="h-3 w-48 rounded bg-slate-100" />
          <div className="h-3 w-40 rounded bg-slate-100" />
        </div>
      </div>
      <div className="hidden items-center justify-center border-l border-slate-200 bg-slate-50/70 p-8 md:flex">
        <div className="aspect-[3/4] w-36 rounded bg-slate-200 motion-safe:animate-pulse" />
      </div>
    </div>
  )
}

function PreviewCard({ preview }: { preview: ImportPreview }) {
  const { t, i18n } = useLingui()
  const displayTitle = preview.title ?? preview.label
  const authors = preview.authors.join(", ")
  const doneFeatures = FEATURE_STAGES.filter((f) => preview.stages[f.name]?.status === "done").length

  return (
    <div className="grid min-h-[400px] w-full grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 md:grid-cols-[minmax(0,1.7fr)_minmax(220px,0.8fr)]">
      {/* Left — Info */}
      <div className="flex flex-col">
        <div className="px-5 pt-5 pb-3 space-y-1">
          <p className="font-semibold text-lg leading-snug line-clamp-2 text-slate-900">
            {displayTitle}
          </p>
          {authors && (
            <p className="text-slate-600 text-xs leading-tight line-clamp-1">{authors}</p>
          )}
        </div>

        <div className="px-5 pb-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Trans>Book info</Trans>
          </p>
          <div className="space-y-2 text-xs text-slate-500">
            {preview.publisher && (
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{preview.publisher}</span>
              </div>
            )}
            {preview.pageCount > 0 && (
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{preview.pageCount} {preview.pageCount === 1 ? t`page` : t`pages`}</span>
              </div>
            )}
            {preview.languageCode && (
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="inline-flex items-center rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-300/50">
                  {preview.languageCode.toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              {preview.imageCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {preview.imageCount} {preview.imageCount === 1 ? t`image` : t`images`}
                </span>
              )}
              {preview.videoCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {preview.videoCount} {preview.videoCount === 1 ? t`video` : t`videos`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pipeline features */}
        <div className="px-5 pb-4 mt-auto">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Trans>Pipeline features</Trans> &middot; {doneFeatures}/{FEATURE_STAGES.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FEATURE_STAGES.map((f) => {
              const info = preview.stages[f.name]
              return (
                <FeatureChip
                  key={f.name}
                  icon={f.icon}
                  label={i18n._(f.label)}
                  textColor={f.textColor}
                  bgLight={f.bgLight}
                  borderColor={f.borderColor}
                  done={info?.status === "done"}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Right — Cover */}
      <PreviewCover coverBase64={preview.coverBase64} alt={preview.title ?? preview.label} />
    </div>
  )
}

function PreviewCover({ coverBase64, alt }: { coverBase64: string | null; alt: string }) {
  return (
    <div className="flex flex-col items-center justify-center border-t border-slate-200 bg-slate-50/70 p-6 md:border-l md:border-t-0">
      {coverBase64 ? (
        <img
          src={coverBase64.startsWith("data:") ? coverBase64 : `data:image/png;base64,${coverBase64}`}
          alt={alt}
          className="w-full max-w-[160px] rounded-sm border border-slate-200 shadow-md object-contain"
        />
      ) : (
        <div className="w-full aspect-[3/4] max-w-[160px] rounded-sm border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center gap-3 shadow-md">
          <BookOpen className="w-10 h-10 text-slate-300" />
          <p className="px-4 text-center text-xs font-medium leading-tight text-slate-500">
            <Trans>No cover available</Trans>
          </p>
        </div>
      )}
    </div>
  )
}

function PartPreviewCard({ preview }: { preview: PartImportPreview }) {
  const { t } = useLingui()
  const displayTitle = preview.title ?? preview.sourceLabel
  const windowSize = preview.range.endPage - preview.range.startPage + 1

  return (
    <div className="grid min-h-[400px] w-full grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 md:grid-cols-[minmax(0,1.7fr)_minmax(220px,0.8fr)]">
      {/* Left — Info */}
      <div className="flex flex-col">
        <div className="px-5 pt-5 pb-3 space-y-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
            <Scissors className="w-3 h-3" />
            <Trans>Book part</Trans>
          </span>
          <p className="font-semibold text-lg leading-snug line-clamp-2 text-slate-900">
            {displayTitle}
          </p>
        </div>

        <div className="px-5 pb-4 mt-auto">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Trans>Part info</Trans>
          </p>
          <div className="space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                <Trans>
                  Pages {preview.range.startPage}–{preview.range.endPage} of {preview.pageCount}
                </Trans>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              <Trans>
                Importing creates a new book limited to {windowSize} pages. Run the
                per-page stages, then export it as a project to merge back into the
                full book.
              </Trans>
            </p>
          </div>
        </div>
      </div>

      {/* Right — Cover */}
      <PreviewCover coverBase64={preview.coverBase64} alt={displayTitle} />
    </div>
  )
}

function AdtBundlePreviewCard({
  preview,
  activityDecisions,
  onReviewActivities,
}: {
  preview: AdtBundleImportPreview
  activityDecisions: Record<string, string | null>
  onReviewActivities: () => void
}) {
  const { i18n } = useLingui()
  const activityReview = preview.activityReview ?? EMPTY_ACTIVITY_REVIEW
  const detectedFeatureNames = new Set([
    activityReview.quizCount > 0 ? "quizzes" : null,
    preview.glossaryEntryCount > 0 ? "glossary" : null,
    preview.tocEntryCount > 0 ? "toc" : null,
    preview.runtimeFeatures.easyRead ? "easy-read" : null,
    preview.runtimeFeatures.signLanguage ? "sign-language" : null,
    preview.translationLanguageCount > 0 ? "translate" : null,
    preview.runtimeFeatures.readAloud ? "speech" : null,
  ].filter((name): name is string => name !== null))
  const detectedFeatures = FEATURE_STAGES.filter((stage) => detectedFeatureNames.has(stage.name))
  const reviewItems = activityReview.items.filter((item) => item.status === "needs-review")
  const classifiedActivityCount = reviewItems.filter((item) => (
    Object.prototype.hasOwnProperty.call(activityDecisions, item.sectionId)
  )).length
  return (
    <div className="grid min-h-[400px] w-full grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 md:grid-cols-[minmax(0,1.7fr)_minmax(220px,0.8fr)]">
      <div className="flex flex-col">
        <div className="space-y-1 px-5 pb-3 pt-5">
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
            <FileArchive className="h-3 w-3" />
            <Trans>Exported ADT</Trans>
          </span>
          <p className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900">
            {preview.title}
          </p>
        </div>

        {preview.legacyRecovery ? (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-xs font-semibold text-amber-950">
                <Trans>Legacy ADT export detected</Trans>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-900">
                <Trans>ADT Studio will recover a new project from the published HTML. The original PDF and extraction history are not available, but the storyboard can be edited and features can be generated again.</Trans>
              </p>
            </div>
          </div>
        ) : null}

        {preview.contentChanged && !preview.legacyRecovery ? (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-xs font-semibold text-amber-900"><Trans>External edits detected</Trans></p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-900">
                <Trans>The edited HTML becomes the working source. Review generated features such as Speech after import.</Trans>
              </p>
            </div>
          </div>
        ) : null}

        {!preview.compatibility.supported ? (
          <AdtImportRepairPanel
            compatibility={preview.compatibility}
            agentGuide={preview.agentGuide}
          />
        ) : null}

        <div className="px-5 pb-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-slate-100 py-3 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Trans>Pages</Trans>
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-800">{preview.pageCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Trans>Source language</Trans>
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-800">
                {preview.sourceLanguage.toUpperCase()}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Trans>Output languages</Trans>
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-slate-800">
                {preview.outputLanguages.length > 0
                  ? preview.outputLanguages.map((language) => language.toUpperCase()).join(", ")
                  : <Trans>None</Trans>}
              </dd>
            </div>
          </dl>
        </div>

        {activityReview.items.length > 0 ? (
          <div className="mx-5 mb-4 border-t border-slate-100 pt-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-700">
                  <Puzzle className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-800"><Trans>Activities</Trans></p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    <Trans>
                      {activityReview.activityCount} in-page activities and {activityReview.quizCount} quizzes detected.
                    </Trans>
                  </p>
                </div>
              </div>
              {activityReview.needsReviewCount === 0 || classifiedActivityCount === reviewItems.length ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <Check className="h-3 w-3" />
                  {activityReview.needsReviewCount === 0
                    ? <Trans>Validated</Trans>
                    : <Trans>Reviewed</Trans>}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  <Trans>{reviewItems.length - classifiedActivityCount} to review</Trans>
                </span>
              )}
            </div>

            {activityReview.needsReviewCount > 0 ? (
              <div className="mt-3 flex min-h-11 items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-amber-950">
                    {classifiedActivityCount === reviewItems.length
                      ? <Trans>Activity review complete</Trans>
                      : <Trans>Review the highlighted pages before importing.</Trans>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    <Trans>{classifiedActivityCount} of {reviewItems.length} pages classified</Trans>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onReviewActivities}
                  className="h-8 shrink-0 border-amber-300 bg-white text-xs text-amber-900 hover:bg-amber-100"
                >
                  <Puzzle className="h-3.5 w-3.5" />
                  {classifiedActivityCount === reviewItems.length
                    ? <Trans>Edit review</Trans>
                    : <Trans>Review activities</Trans>}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="px-5 pb-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Trans>Detected features</Trans>
          </p>
          {detectedFeatures.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {detectedFeatures.map((feature) => (
                <FeatureChip
                  key={feature.name}
                  icon={feature.icon}
                  label={i18n._(feature.label)}
                  textColor={feature.textColor}
                  bgLight={feature.bgLight}
                  borderColor={feature.borderColor}
                  done
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500"><Trans>No generated features detected</Trans></p>
          )}
        </div>

        {preview.compatibility.supported ? (
          <div className="mx-5 mt-auto flex items-start gap-2 border-t border-slate-100 py-3 text-xs leading-relaxed text-slate-600">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <p>
              <span className="font-medium text-slate-700">
                <Trans>A separate project will be created.</Trans>
              </span>{" "}
              <Trans>Existing projects stay unchanged. The imported HTML becomes the working source.</Trans>
            </p>
          </div>
        ) : null}
      </div>

      <PreviewCover coverBase64={preview.coverBase64} alt={preview.title} />
    </div>
  )
}


export function ImportProject() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const importMutation = useImportBook()
  const adtImportMutation = useImportAdtProject()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRequestRef = useRef(0)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<AnyImportPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [activityDecisions, setActivityDecisions] = useState<Record<string, string | null>>({})
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)

  const friendlyPreviewError = useFriendlyArchiveError(previewError)
  const rawImportError = adtImportMutation.error?.message
    ?? (importMutation.error
      ? importMutation.error instanceof Error
        ? importMutation.error.message
        : String(importMutation.error)
      : null)
  const friendlyImportError = useFriendlyArchiveError(rawImportError)
  const rawPreviewValidationError = preview
    && !isPartImportPreview(preview)
    && !isAdtBundleImportPreview(preview)
    ? preview.validationError
    : null
  const friendlyPreviewValidationError = useFriendlyArchiveError(rawPreviewValidationError)
  const importPending = importMutation.isPending || adtImportMutation.isPending
  const unsupportedAdt = Boolean(
    preview
    && isAdtBundleImportPreview(preview)
    && !preview.compatibility.supported,
  )

  const loadPreview = useCallback(async (file: File) => {
    if (importPending) return
    const requestId = ++previewRequestRef.current
    setPreviewLoading(true)
    setPreviewError(null)
    setPreview(null)
    setActivityDecisions({})
    setActivityDialogOpen(false)
    importMutation.reset()
    adtImportMutation.reset()
    try {
      const result = await api.previewImport(file)
      if (requestId !== previewRequestRef.current) return
      setPreview(result)
    } catch (err) {
      if (requestId !== previewRequestRef.current) return
      setPreviewError(err instanceof Error ? err.message : t`Failed to read archive`)
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false)
    }
  }, [t, importMutation.reset, adtImportMutation.reset, importPending])

  const handleAccept = useCallback((f: File) => {
    if (importPending) return
    setZipFile(f)
    loadPreview(f)
  }, [importPending, loadPreview])

  const { overlay } = useFileDropZone({
    accept: isZipFile,
    onAccept: handleAccept,
    enabled: !importPending,
  })

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0]
      if (!importPending && picked && isZipFile(picked)) handleAccept(picked)
      e.target.value = ""
    },
    [handleAccept, importPending],
  )

  const handleImport = useCallback(() => {
    if (importPending || !zipFile || !preview) return
    if (isAdtBundleImportPreview(preview)) {
      if (!preview.compatibility.supported) return
      const activityReview = preview.activityReview ?? EMPTY_ACTIVITY_REVIEW
      const unresolved = activityReview.items.some((item) => (
        item.status === "needs-review"
        && !Object.prototype.hasOwnProperty.call(activityDecisions, item.sectionId)
      ))
      if (unresolved) {
        setActivityDialogOpen(true)
        return
      }
      const decisions = activityReview.items
        .filter((item) => item.status === "needs-review")
        .map((item) => ({
          sectionId: item.sectionId,
          type: activityDecisions[item.sectionId] ?? null,
        }))
      adtImportMutation.mutate({ zip: zipFile, activityDecisions: decisions }, {
        onSuccess: (book) => navigate({
          to: "/books/$label/$step",
          params: { label: book.label, step: "book" },
        }),
      })
      return
    }
    importMutation.mutate(zipFile, {
      onSuccess: () => navigate({ to: "/" }),
    })
  }, [
    importPending,
    zipFile,
    preview,
    activityDecisions,
    importMutation,
    adtImportMutation,
    navigate,
  ])

  const hasPreview = !!(zipFile && preview && !previewError)
  const activeError = friendlyImportError ?? friendlyPreviewError ?? friendlyPreviewValidationError

  const clearFile = useCallback(() => {
    if (importPending) return
    previewRequestRef.current += 1
    setZipFile(null)
    setPreview(null)
    setPreviewError(null)
    setActivityDecisions({})
    setActivityDialogOpen(false)
    importMutation.reset()
    adtImportMutation.reset()
  }, [importMutation, adtImportMutation, importPending])

  const unresolvedActivityCount = preview && isAdtBundleImportPreview(preview)
    ? (preview.activityReview ?? EMPTY_ACTIVITY_REVIEW).items.filter((item) => (
        item.status === "needs-review"
        && !Object.prototype.hasOwnProperty.call(activityDecisions, item.sectionId)
      )).length
    : 0
  const activityReview = preview && isAdtBundleImportPreview(preview)
    ? preview.activityReview ?? EMPTY_ACTIVITY_REVIEW
    : null

  const phase: ImportPhase = importPending || friendlyImportError
    ? "importing"
    : previewLoading || friendlyPreviewError || friendlyPreviewValidationError
        ? "reading"
        : hasPreview
          ? "review"
          : "select"
  const rawActiveError = rawImportError ?? previewError ?? rawPreviewValidationError

  return (
    <>
      <FileDropOverlay
        overlay={overlay}
        dropLabel={<Trans>Drop ZIP here</Trans>}
        errorLabel={<Trans>Only ZIP files are supported</Trans>}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        disabled={importPending}
        className="hidden"
        onChange={handleFileChange}
      />

      {activityReview && activityReview.needsReviewCount > 0 ? (
        <ActivityClassificationDialog
          open={activityDialogOpen}
          onOpenChange={setActivityDialogOpen}
          review={activityReview}
          decisions={activityDecisions}
          onDecision={(sectionId, type) => setActivityDecisions((current) => ({
            ...current,
            [sectionId]: type,
          }))}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-50/40">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-col px-5 pb-0 pt-6 sm:px-8 lg:px-10">
          <header className="shrink-0 text-center">
            <h1 className="text-2xl font-semibold tracking-[-0.5px] text-slate-950 sm:text-[28px]">
              <Trans>Import a book</Trans>
            </h1>
            <p className="mx-auto mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              <Trans>Bring in an ADT Studio project, a completed book part, or an exported ADT publication.</Trans>
            </p>
            <ImportProgress
              phase={phase}
              hasPreviewError={Boolean(friendlyPreviewError || friendlyPreviewValidationError || unsupportedAdt)}
              hasImportError={Boolean(friendlyImportError)}
            />
          </header>

          <div className="mt-5 shrink-0">
            <ImportStatus
              phase={phase}
              error={activeError}
              rawError={rawActiveError}
              isUnsupported={unsupportedAdt}
            />
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 pt-1">
            <div className="mx-auto min-h-[495px] w-full max-w-4xl">
              {previewLoading ? (
                <ArchiveReviewSkeleton />
              ) : hasPreview && zipFile && preview ? (
                <div aria-busy={importPending}>
                  <div className="mb-3 flex min-h-10 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileArchive className="h-4 w-4 shrink-0 text-slate-500" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">{zipFile.name}</p>
                        <p className="text-[11px] text-slate-500">{formatBytes(zipFile.size)}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearFile}
                      disabled={importPending}
                      className="shrink-0 text-slate-600"
                    >
                      <Trash2 className="h-4 w-4" />
                      <Trans>Choose another file</Trans>
                    </Button>
                  </div>
                  {isPartImportPreview(preview) ? (
                    <PartPreviewCard preview={preview} />
                  ) : isAdtBundleImportPreview(preview) ? (
                    <AdtBundlePreviewCard
                      preview={preview}
                      activityDecisions={activityDecisions}
                      onReviewActivities={() => setActivityDialogOpen(true)}
                    />
                  ) : (
                    <PreviewCard preview={preview} />
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                    aria-label={t`Upload ZIP or drag and drop`}
                    className={cn(
                      "flex min-h-[440px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white px-8 text-center transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2",
                      friendlyPreviewError
                        ? "border-red-300 bg-red-50/30 hover:border-red-400 hover:bg-red-50/50"
                        : "border-slate-300 hover:border-amber-400 hover:bg-amber-50/20",
                    )}
                  >
                    <span className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full",
                      friendlyPreviewError ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700",
                    )}>
                      <Upload className="h-5 w-5" />
                    </span>
                    <p className="mt-4 text-sm font-semibold text-slate-900">
                      {friendlyPreviewError
                        ? <Trans>Choose another archive</Trans>
                        : <Trans>Select a ZIP archive</Trans>}
                    </p>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                      <Trans>Click to browse, or drag and drop a ZIP anywhere in this window.</Trans>
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
                      <span><Trans>Project backup</Trans></span>
                      <span><Trans>Completed book part</Trans></span>
                      <span><Trans>Exported ADT Web ZIP</Trans></span>
                    </div>
                  </div>
                  {!zipFile ? (
                    <p className="text-center text-xs text-slate-500">
                      <Trans>Starting from a PDF?</Trans>{" "}
                      <Link
                        to="/books/new"
                        className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
                      >
                        <Trans>Create a new book</Trans>
                      </Link>
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </main>

          <footer className="shrink-0 border-t border-slate-200 bg-slate-50/95 py-4">
            <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
              <Button
                variant="secondary"
                onClick={() => navigate({ to: "/" })}
                disabled={importPending}
                className="h-9 border-0 bg-slate-200/70 px-3 text-slate-800 hover:bg-slate-200"
              >
                <ArrowLeft className="h-4 w-4" />
                <Trans>Back</Trans>
              </Button>
              <Button
                disabled={
                  !preview ||
                  (!isPartImportPreview(preview) && !isAdtBundleImportPreview(preview) && !!preview.validationError) ||
                  importPending
                }
                onClick={unsupportedAdt ? () => fileInputRef.current?.click() : handleImport}
                className="h-9 border-0 bg-amber-700 px-4 text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {importPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    <Trans>Importing...</Trans>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {unsupportedAdt
                      ? <Trans>Choose corrected ZIP</Trans>
                      : preview && isAdtBundleImportPreview(preview)
                        ? unresolvedActivityCount > 0
                        ? <Trans>Review {unresolvedActivityCount} activities</Trans>
                        : <Trans>Import as new project</Trans>
                      : <Trans>Import</Trans>}
                  </>
                )}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </>
  )
}
