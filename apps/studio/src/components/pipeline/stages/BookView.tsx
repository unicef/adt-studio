import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  FileText,
  type LucideIcon,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { type StageName } from "@adt/types"
import {
  getBookOverviewStages,
  isPipelineStage,
  type NonBookStageDefinition,
  type StageGroup,
} from "../stage-config"
import {
  STAGE_SUB_STEPS,
  type StageSubStep,
} from "../components/StageRunCard"
import { SubStepPillRow } from "../components/SubStepPillRow"
import {
  getStageDescriptionI18n,
  getStageLabelI18n,
  getStageRunningLabelI18n,
  getStepLabelI18n,
} from "../pipeline-i18n"
import { useBookRun } from "@/hooks/use-book-run"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import { useBook, usePackageAdtStatus } from "@/hooks/use-books"
import { getSourcePdfUrl } from "@/api/client"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useSignLanguageVideos } from "@/hooks/use-sign-language-videos"
import { Badge } from "@/components/ui/badge"
import { BookPartsPanel } from "@/components/parts/BookPartsPanel"
import { cn } from "@/lib/utils"

interface ViewProps {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}

const GROUP_ORDER: StageGroup[] = [
  "convert",
  "enhancements",
  "localization",
  "packaging",
]

const RECOMMENDED_STAGES = new Set<string>(["captions"])

export function BookView({ bookLabel }: ViewProps) {
  const { t } = useLingui()
  const overviewSteps = getBookOverviewStages()

  // When the create-book wizard finished with the "split into parts" intent, it
  // leaves a one-shot flag so we scroll to and briefly highlight the split panel.
  const partsRef = useRef<HTMLDivElement>(null)
  const [focusParts, setFocusParts] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem("adt:focus-parts") !== bookLabel) return
    window.sessionStorage.removeItem("adt:focus-parts")
    setFocusParts(true)
    partsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    const timer = setTimeout(() => setFocusParts(false), 2400)
    return () => clearTimeout(timer)
  }, [bookLabel])
  const {
    stageState,
    stepState,
    stepProgress,
    stepError,
    error: runError,
  } = useBookRun()
  const { data: accessibilityAssessment } = useAccessibilityAssessment(bookLabel)
  const { data: signLanguageData } = useSignLanguageVideos(bookLabel)
  const { data: packageStatus } = usePackageAdtStatus(bookLabel)
  const { tasks } = useBookTasks(bookLabel)
  const validationCompleted = Boolean(accessibilityAssessment?.assessment)
  const signLanguageCompleted =
    signLanguageData?.videos?.some((v) => v.sectionId !== null) ?? false
  const previewCompleted = packageStatus?.hasAdt ?? false
  const exportCompleted = tasks.some(
    (t) => t.kind === "prepare-export" && t.status === "completed",
  )
  const completionOverrides: Record<string, boolean> = {
    "sign-language": signLanguageCompleted,
    validation: validationCompleted,
    preview: previewCompleted,
    export: exportCompleted,
  }

  const grouped: Record<StageGroup, NonBookStageDefinition[]> = {
    convert: [],
    enhancements: [],
    localization: [],
    packaging: [],
  }
  for (const step of overviewSteps) {
    const group =
      "group" in step ? (step.group as StageGroup | undefined) : undefined
    if (group) grouped[group].push(step)
  }

  // Assign sequential phase numbers — Core Pipeline stages each get their
  // own phase, then the Enhancements block counts as one phase, then the
  // Localization block counts as one phase, then each Packaging stage gets
  // its own phase.
  const phaseNumberByStage = new Map<string, number>()
  let phaseCounter = 0
  for (const step of grouped.convert) {
    phaseCounter += 1
    phaseNumberByStage.set(step.slug, phaseCounter)
  }
  const enrichmentPhase =
    grouped.enhancements.length > 0 ? ++phaseCounter : null
  const localizationPhase =
    grouped.localization.length > 0 ? ++phaseCounter : null
  for (const step of grouped.packaging) {
    phaseCounter += 1
    phaseNumberByStage.set(step.slug, phaseCounter)
  }

  const cardPropsFor = (step: NonBookStageDefinition): HomeStageCardProps => {
    const rawState = stageState(step.slug)
    const state = completionOverrides[step.slug] ? "done" : rawState
    const isRunning = isPipelineStage(step) && rawState === "running"
    const isQueued = isPipelineStage(step) && rawState === "queued"
    const isCompleted = state === "done"
    const hasError = rawState === "error"
    return {
      stage: step,
      bookLabel,
      isRunning,
      isQueued,
      isCompleted,
      hasError,
      recommended: RECOMMENDED_STAGES.has(step.slug),
      stepState,
      stepProgress,
      stepError,
      runError,
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <BookOverviewCard bookLabel={bookLabel} />

      <div
        ref={partsRef}
        className={cn(
          "rounded-2xl transition-shadow duration-500",
          focusParts && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <BookPartsPanel bookLabel={bookLabel} />
      </div>

      {/* Core Pipeline cluster — connectors hug the cards. */}
      <div className="flex flex-col gap-2">
        {grouped.convert.map((step, index) => (
          <Fragment key={step.slug}>
            <PhaseBlock phaseNumber={phaseNumberByStage.get(step.slug)!}>
              <HomeStageCard {...cardPropsFor(step)} />
            </PhaseBlock>
            {index < grouped.convert.length - 1 && (
              <PhaseConnector label={t`Continue`} />
            )}
          </Fragment>
        ))}
      </div>

      {/* Post-core callouts */}
      {grouped.convert.length > 0 && (
        <div className="flex flex-col gap-3">
          <InstructionCallout
            variant="info"
            icon={ArrowRight}
            title={<Trans>You can export at this stage</Trans>}
            body={
              <Trans>
                Export is not blocked by the stages below. As soon as
                Storyboard is done, you can ship a bundle. Enhancements,
                Localization, and Validation are optional ways to enrich the
                book — you can export again anytime later.
              </Trans>
            }
          />
          <InstructionCallout
            variant="warning"
            icon={AlertTriangle}
            title={
              <Trans>
                Warning: Image Captions are required for accessibility
              </Trans>
            }
            body={
              <Trans>
                If you don't run Image Captions, your output will not be
                accessible to readers who use screen readers or can't see the
                images.
              </Trans>
            }
          />
        </div>
      )}

      {/* Enhancements cluster (connector + section). */}
      {enrichmentPhase !== null && (
        <div className="flex flex-col gap-2">
          <PhaseConnector label={t`Branch out`} />
          <OptionalGroupSection
            phaseNumber={enrichmentPhase}
            title={<Trans>Enhancements</Trans>}
            description={
              <Trans>
                These stages are optional. They don't depend on each other —
                run any of them in any order once the core pipeline is
                complete.
              </Trans>
            }
            containerClassName="bg-gradient-to-br from-indigo-50/40 via-violet-50/30 to-white"
            steps={grouped.enhancements}
            layout="grid"
            cardPropsFor={cardPropsFor}
          />
        </div>
      )}

      {/* Localization cluster — also optional. */}
      {localizationPhase !== null && (
        <div className="flex flex-col gap-2">
          <PhaseConnector label={t`Or`} />
          <OptionalGroupSection
            phaseNumber={localizationPhase}
            title={<Trans>Localization</Trans>}
            description={
              <Trans>
                Translate the book into other languages and generate
                narration. These stages are optional — skip them if your
                book doesn't need multilingual or audio output.
              </Trans>
            }
            containerClassName="bg-gradient-to-br from-pink-50/30 via-rose-50/20 to-white"
            steps={grouped.localization}
            layout="stack"
            cardPropsFor={cardPropsFor}
          />
        </div>
      )}

      {/* Packaging cluster */}
      {grouped.packaging.length > 0 && (
        <div className="flex flex-col gap-2">
          <PhaseConnector label={t`Ship`} />
          {grouped.packaging.map((step, index) => (
            <Fragment key={step.slug}>
              <PhaseBlock phaseNumber={phaseNumberByStage.get(step.slug)!}>
                <HomeStageCard {...cardPropsFor(step)} />
              </PhaseBlock>
              {index < grouped.packaging.length - 1 && (
                <PhaseConnector label={t`Continue`} />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HomeStageCard — modern, larger stage card used on the home overview only.
// ---------------------------------------------------------------------------

interface HomeStageCardProps {
  stage: NonBookStageDefinition
  bookLabel: string
  isRunning: boolean
  isQueued: boolean
  isCompleted: boolean
  hasError: boolean
  recommended: boolean
  stepState: (key: string) => string
  stepProgress: (key: string) => { page?: number; totalPages?: number } | undefined
  stepError: (key: string) => string | undefined
  runError: string | null
}

function HomeStageCard({
  stage,
  bookLabel,
  isRunning,
  isQueued,
  isCompleted,
  hasError,
  recommended,
  stepState,
  stepProgress,
  stepError,
  runError,
}: HomeStageCardProps) {
  const navigate = useNavigate()
  const Icon = stage.icon
  const subSteps: StageSubStep[] = STAGE_SUB_STEPS[stage.slug as StageName] ?? []
  const description = getStageDescriptionI18n(stage.slug)
  const stageLabel = getStageLabelI18n(stage.slug)
  const runningLabel = getStageRunningLabelI18n(stage.slug)

  const stepErrorLines = subSteps.flatMap((s) => {
    const msg = stepError(s.key)
    return msg ? [`${getStepLabelI18n(s.key)}: ${msg}`] : []
  })
  const errorText = stepErrorLines.length
    ? stepErrorLines.join("\n\n")
    : (runError ?? "")

  const handleCardClick = () => {
    navigate({
      to: "/books/$label/$step",
      params: { label: bookLabel, step: stage.slug },
    })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleCardClick()
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all",
        "hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        hasError
          ? "border-destructive/40"
          : isCompleted
            ? "border-border"
            : "border-border/70",
      )}
    >
      {/* Accent bar */}
      <div
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", stage.color)}
      />

      {/* Main row */}
      <div className="flex items-start gap-5 p-5">
        {/* Icon squircle */}
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm",
            stage.color,
          )}
        >
          <Icon className="h-6 w-6 text-white" strokeWidth={2} />
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold leading-tight tracking-tight text-foreground">
              {isRunning ? runningLabel : stageLabel}
            </h3>
            <StageStatusBadge
              isCompleted={isCompleted}
              isRunning={isRunning}
              isQueued={isQueued}
              hasError={hasError}
            />
            {recommended && (
              <Badge className="border-transparent bg-amber-100 text-[10px] uppercase tracking-wider text-amber-900 hover:bg-amber-100">
                <Trans>Recommended</Trans>
              </Badge>
            )}
          </div>

          {description && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}

          {subSteps.length > 0 && (
            <SubStepPillRow
              subSteps={subSteps}
              stepState={stepState}
              stepProgress={stepProgress}
              stepError={stepError}
            />
          )}
        </div>

        {/* Right affordance — click anywhere on the card to open the stage page */}
        <ChevronRight
          aria-hidden
          className="h-5 w-5 shrink-0 self-center text-muted-foreground/40 transition-colors group-hover:text-foreground/70"
        />
      </div>

      {/* Error output — full width, copyable */}
      {hasError && errorText && <StageErrorOutput errorText={errorText} />}
    </div>
  )
}

function StageErrorOutput({ errorText }: { errorText: string }) {
  const { t } = useLingui()
  const [copied, setCopied] = useState(false)

  const stop = (e: MouseEvent) => e.stopPropagation()

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(errorText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("Failed to copy error output", err)
    }
  }

  return (
    <div
      onClick={stop}
      className="mx-5 mb-5 rounded-lg border border-destructive/30 bg-destructive/5"
    >
      <div className="flex items-center justify-between gap-2 border-b border-destructive/20 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
          <Trans>Error output</Trans>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={t`Copy error output`}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              <Trans>Copied</Trans>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <Trans>Copy</Trans>
            </>
          )}
        </button>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed text-destructive/90">
        {errorText}
      </pre>
    </div>
  )
}

function StageStatusBadge({
  isCompleted,
  isRunning,
  isQueued,
  hasError,
}: {
  isCompleted: boolean
  isRunning: boolean
  isQueued: boolean
  hasError: boolean
}) {
  if (hasError) {
    return (
      <Badge
        variant="destructive"
        className="border-transparent text-[10px] uppercase tracking-wider"
      >
        <Trans>Error</Trans>
      </Badge>
    )
  }
  if (isCompleted) {
    return (
      <Badge className="border-transparent bg-emerald-100 text-[10px] uppercase tracking-wider text-emerald-900 hover:bg-emerald-100">
        <Trans>Done</Trans>
      </Badge>
    )
  }
  if (isRunning) {
    return (
      <Badge className="border-transparent bg-blue-100 text-[10px] uppercase tracking-wider text-blue-900 hover:bg-blue-100">
        <Trans>Running</Trans>
      </Badge>
    )
  }
  if (isQueued) {
    return (
      <Badge className="border-transparent bg-amber-100 text-[10px] uppercase tracking-wider text-amber-900 hover:bg-amber-100">
        <Trans>Queued</Trans>
      </Badge>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// PhaseBlock / PhaseConnector — wrap each phase and the arrow between them.
// ---------------------------------------------------------------------------

function PhaseBlock({
  phaseNumber,
  children,
}: {
  phaseNumber: number
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <p className="px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/60">
        <Trans>Phase {phaseNumber}</Trans>
      </p>
      {children}
    </section>
  )
}

function PhaseConnector({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      className="flex flex-col items-center gap-1 self-center text-muted-foreground/40"
    >
      <div className="h-3 w-px bg-current" />
      <ArrowDown className="h-3.5 w-3.5" />
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">
        {label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OptionalGroupSection — single bordered block for an "optional" stage group
// (Enhancements / Localization). Layout is either a 2-col grid for parallel
// stages or a vertical stack for sequential ones.
// ---------------------------------------------------------------------------

function OptionalGroupSection({
  phaseNumber,
  title,
  description,
  containerClassName,
  steps,
  layout,
  cardPropsFor,
}: {
  phaseNumber: number
  title: ReactNode
  description: ReactNode
  containerClassName: string
  steps: NonBookStageDefinition[]
  layout: "grid" | "stack"
  cardPropsFor: (step: NonBookStageDefinition) => HomeStageCardProps
}) {
  return (
    <section className="flex flex-col gap-3">
      <p className="px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/60">
        <Trans>Phase {phaseNumber}</Trans>
      </p>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-border/70 p-6",
          containerClassName,
        )}
      >
        <div className="mb-5 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              <Trans>Optional</Trans>
            </Badge>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <div
          className={cn(
            layout === "grid"
              ? "grid grid-cols-1 gap-3 md:grid-cols-2"
              : "flex flex-col gap-2",
          )}
        >
          {steps.map((step) => (
            <HomeStageCard key={step.slug} {...cardPropsFor(step)} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// InstructionCallout — info/warning banners (export-available, captions).
// ---------------------------------------------------------------------------

function InstructionCallout({
  variant,
  icon: Icon,
  title,
  body,
}: {
  variant: "info" | "warning"
  icon: LucideIcon
  title: ReactNode
  body: ReactNode
}) {
  const styles =
    variant === "info"
      ? {
          wrap: "border-emerald-200/70 bg-emerald-50/50",
          iconWrap: "bg-emerald-100 text-emerald-700",
        }
      : {
          wrap: "border-amber-200/60 bg-amber-50/40",
          iconWrap: "bg-amber-100/70 text-amber-700",
        }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3",
        styles.wrap,
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          styles.iconWrap,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="text-[13px] font-semibold leading-tight text-foreground">
          {title}
        </h3>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BookOverviewCard — top-of-page hero: book info + a short orientation to
// the pipeline laid out below.
// ---------------------------------------------------------------------------

function BookOverviewCard({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: book } = useBook(bookLabel)
  const { data: pages } = usePages(bookLabel)
  const firstPageId = pages?.[0]?.pageId
  const { data: pageImage } = usePageImage(bookLabel, firstPageId ?? "", {
    enabled: !!firstPageId,
  })

  // File extension is the same across locales — no translation needed.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const pdfFilename = `${bookLabel}.pdf`
  const title = book?.title?.trim() || null
  const pageCount = book?.pageCount ?? 0
  const imgSrc = pageImage?.imageBase64
    ? `data:image/png;base64,${pageImage.imageBase64}`
    : null
  const canOpenPdf = book?.hasSourcePdf ?? false
  const pdfUrl = getSourcePdfUrl(bookLabel)

  const headerInner = (
    <>
      <div className="flex h-[88px] w-[66px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <FileText
            className="h-6 w-6 text-muted-foreground/40"
            strokeWidth={1.5}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Trans>Your book</Trans>
        </p>
        <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-foreground">
          {title ?? pdfFilename}
        </h1>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {title ? (
            pageCount > 0 ? (
              <Trans>
                {pdfFilename} · {pageCount} pages
              </Trans>
            ) : (
              pdfFilename
            )
          ) : pageCount > 0 ? (
            <Trans>{pageCount} pages</Trans>
          ) : null}
        </p>
      </div>
      {canOpenPdf && (
        <div className="hidden shrink-0 flex-col items-center gap-0.5 self-center text-muted-foreground/50 transition-colors group-hover:text-foreground/70 sm:flex">
          <ArrowRight className="h-5 w-5" strokeWidth={2} />
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em]">
            <Trans>Open</Trans>
          </span>
        </div>
      )}
    </>
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {canOpenPdf ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t`Open source PDF in a new tab`}
          className="group flex items-start gap-5 px-6 py-5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {headerInner}
        </a>
      ) : (
        <header className="flex items-start gap-5 px-6 py-5">{headerInner}</header>
      )}

      <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-6 py-5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Trans>How it works</Trans>
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          <Trans>
            Use the sidebar on the left to open any stage of the
            pipeline. Each stage has its own page where you can review
            its content, configure its settings, and start a run. The
            cards below mirror that navigation — click a card to jump
            straight to that stage's page.
          </Trans>
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <Trans>
            Stages are rerunable and every result is versioned, so
            experimenting is safe — nothing is ever overwritten.
          </Trans>
        </p>
      </div>
    </section>
  )
}

