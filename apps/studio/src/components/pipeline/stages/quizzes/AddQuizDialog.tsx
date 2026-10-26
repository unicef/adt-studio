import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  Plus,
} from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  SegmentedControl,
  type SegmentedControlOption,
} from "@/components/ui/segmented-control"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useQuizzes } from "@/hooks/use-quizzes"
import { useApiKey, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { useStageStatus } from "@/hooks/use-stage-status"

const MAX_SOURCE_PAGES = 5

type PageRef = { pageId: string; pageNumber: number }
/** How a new quiz relates to quizzes already sitting at the chosen position. */
type QuizPlacement = "after" | "replace"

/** A page thumbnail in the bottom filmstrip. Click navigates; the corner badge toggles selection. */
function FilmstripThumb({
  bookLabel,
  page,
  isCurrent,
  isSelected,
  selectDisabled,
  onNavigate,
  onToggleSelect,
}: {
  bookLabel: string
  page: PageRef
  isCurrent: boolean
  isSelected: boolean
  selectDisabled: boolean
  onNavigate: () => void
  onToggleSelect: () => void
}) {
  const { t } = useLingui()
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { root: el.parentElement, rootMargin: "300px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])

  const { data } = usePageImage(bookLabel, page.pageId, { enabled: visible })
  const src = data?.imageBase64
    ? `data:image/png;base64,${data.imageBase64}`
    : null

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={onNavigate}
        aria-current={isCurrent}
        title={t`Page ${page.pageNumber}`}
        className={cn(
          "relative flex h-28 w-20 flex-col overflow-hidden rounded-md border bg-muted transition-all",
          isSelected
            ? "border-orange-500 ring-2 ring-orange-500/40"
            : "border-border hover:border-orange-300",
          isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-1 pb-0.5 pt-3 text-center text-[11px] font-semibold text-white">
          {page.pageNumber}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleSelect}
        disabled={selectDisabled}
        aria-pressed={isSelected}
        aria-label={
          isSelected
            ? t`Remove page ${page.pageNumber} from the quiz`
            : t`Use page ${page.pageNumber} for the quiz`
        }
        className={cn(
          "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors",
          isSelected
            ? "border-orange-500 bg-orange-500 text-white"
            : "border-white/80 bg-black/40 text-white hover:bg-black/60",
          selectDisabled && "cursor-not-allowed opacity-40",
        )}
      >
        {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
    </div>
  )
}

/** The clickable gap between two pages that marks where the quiz is inserted. */
function InsertGap({
  active,
  hasExistingQuiz,
  onSelect,
}: {
  active: boolean
  hasExistingQuiz: boolean
  onSelect: () => void
}) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      title={
        hasExistingQuiz
          ? t`A quiz already sits here — add another after it or replace it`
          : t`Insert the quiz here`
      }
      className="group relative flex h-28 w-8 shrink-0 items-center justify-center"
    >
      <span
        className={cn(
          "absolute inset-y-2 w-0.5 rounded-full transition-colors",
          active
            ? "bg-orange-500"
            : hasExistingQuiz
              ? "bg-amber-400"
              : "bg-border group-hover:bg-orange-300",
        )}
      />
      <span
        className={cn(
          "relative flex h-6 w-6 items-center justify-center rounded-full border transition-all",
          active
            ? "border-orange-500 bg-orange-500 text-white"
            : hasExistingQuiz
              ? "border-amber-400 bg-amber-50 text-amber-600 group-hover:border-orange-400"
              : "border-border bg-background text-muted-foreground group-hover:border-orange-400 group-hover:text-orange-500",
        )}
      >
        {active ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : hasExistingQuiz ? (
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  )
}

export function AddQuizDialog({
  open,
  onOpenChange,
  bookLabel,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookLabel: string
  /** Overrides the default navigation to the classic quizzes route after a
   *  quiz is created — the new pipeline UI stays in place and just refreshes. */
  onCreated?: () => void
}) {
  const { t } = useLingui()
  const { data: pages } = usePages(bookLabel)
  const { data: existingQuizzes } = useQuizzes(bookLabel)
  const {
    apiKey,
    anthropicKey,
    googleKey,
    customBaseUrl,
    customApiKey,
    geminiKey,
  } = useApiKey()
  const hasStructuredTextProvider = useBookStructuredTextAvailability(bookLabel)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  // A running (or queued) quiz-generation stage rewrites the whole quiz set when
  // it finishes, which would clobber a hand-added quiz — so block adding until
  // it's done.
  const { isRunning: stageRunning } = useStageStatus("quizzes")

  const [selected, setSelected] = useState<string[]>([])
  const [afterPageId, setAfterPageId] = useState("")
  const [afterTouched, setAfterTouched] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [placement, setPlacement] = useState<QuizPlacement>("after")
  const [error, setError] = useState<string | null>(null)

  const renderedPages = useMemo(
    () => (pages ?? []).filter((p) => p.hasRendering),
    [pages]
  )

  // How many quizzes already sit at each position (afterPageId). A position can
  // hold several quizzes shown one after another, so generating at an occupied
  // spot lets the user stack a new quiz after them or replace what's there.
  const quizCountByAfterPageId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const q of existingQuizzes?.quizzes?.quizzes ?? []) {
      counts.set(q.afterPageId, (counts.get(q.afterPageId) ?? 0) + 1)
    }
    return counts
  }, [existingQuizzes])

  useEffect(() => {
    if (open) {
      setSelected([])
      setAfterPageId("")
      setAfterTouched(false)
      setCurrentIndex(0)
      setGenerating(false)
      setPlacement("after")
      setError(null)
    }
  }, [open])

  // Default the placement to the last selected page until the user overrides it.
  useEffect(() => {
    if (afterTouched) return
    if (selected.length === 0) {
      setAfterPageId("")
      return
    }
    const numberById = new Map(renderedPages.map((p) => [p.pageId, p.pageNumber]))
    const last = [...selected].sort(
      (a, b) => (numberById.get(a) ?? 0) - (numberById.get(b) ?? 0)
    )[selected.length - 1]
    setAfterPageId(last)
  }, [selected, afterTouched, renderedPages])

  const current = renderedPages[currentIndex] as PageRef | undefined
  const atLimit = selected.length >= MAX_SOURCE_PAGES
  const occupiedCount = afterPageId
    ? quizCountByAfterPageId.get(afterPageId) ?? 0
    : 0
  const isOccupied = occupiedCount > 0

  const placementOptions: SegmentedControlOption<QuizPlacement>[] = [
    { value: "after", label: t`Add after` },
    { value: "replace", label: t`Replace` },
  ]

  const generateLabel = !isOccupied
    ? t`Generate quiz`
    : placement === "replace"
      ? occupiedCount > 1
        ? t`Replace quizzes`
        : t`Replace quiz`
      : t`Add quiz here`

  const { data: currentImage } = usePageImage(bookLabel, current?.pageId ?? "", {
    enabled: !!current,
  })
  const currentSrc = currentImage?.imageBase64
    ? `data:image/png;base64,${currentImage.imageBase64}`
    : null

  const toggle = (pageId: string) => {
    setError(null)
    setSelected((prev) => {
      if (prev.includes(pageId)) return prev.filter((id) => id !== pageId)
      if (prev.length >= MAX_SOURCE_PAGES) return prev
      return [...prev, pageId]
    })
  }

  const goTo = (index: number) => {
    setCurrentIndex(Math.max(0, Math.min(renderedPages.length - 1, index)))
  }

  const pickPlacement = (pageId: string) => {
    setAfterTouched(true)
    setAfterPageId(pageId)
    // Each newly chosen position starts on the additive (non-destructive) action.
    setPlacement("after")
  }

  const handleGenerate = async () => {
    if (
      !hasStructuredTextProvider ||
      selected.length === 0 ||
      !afterPageId ||
      generating ||
      stageRunning
    )
      return
    setGenerating(true)
    setError(null)
    try {
      await api.generateQuiz(
        bookLabel,
        apiKey,
        {
          pageIds: selected,
          afterPageId,
          placement: isOccupied ? placement : "after",
        },
        {
          anthropicApiKey: anthropicKey || undefined,
          googleApiKey: googleKey || undefined,
          customBaseUrl: customBaseUrl || undefined,
          customApiKey: customApiKey || undefined,
          geminiApiKey: geminiKey || undefined,
        }
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "quizzes"],
        }),
        // Adding a quiz marks the quiz-generation step done server-side; refresh
        // step-status so the quizzes stage lights up as completed right away.
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "step-status"],
        }),
      ])
      onOpenChange(false)
      if (onCreated) {
        onCreated()
      } else {
        void navigate({
          to: "/books/$label/$step",
          params: { label: bookLabel, step: "quizzes" },
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Failed to generate the quiz.`)
    } finally {
      setGenerating(false)
    }
  }

  const currentSelected = !!current && selected.includes(current.pageId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-[72rem] flex-col gap-0 p-0"
        style={
          {
            "--accent-color": "#ea580c",
            "--ring": "#ea580c",
          } as React.CSSProperties
        }
      >
        <DialogHeader className="flex-row items-center justify-between gap-4 border-b px-6 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <HelpCircle
                className="h-4 w-4 text-orange-500"
                strokeWidth={2.25}
                aria-hidden
              />
              <DialogTitle>{t`Add a quiz`}</DialogTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              {t`Select the pages the quiz is written from, then choose where it appears using the buttons between pages.`}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {t`${selected.length}/${MAX_SOURCE_PAGES} selected`}
          </span>
        </DialogHeader>

        {renderedPages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="rounded-md border px-4 py-6 text-sm text-muted-foreground">
              {t`No rendered pages yet. Run Storyboard first.`}
            </p>
          </div>
        ) : (
          <>
            {/* Fullscreen preview of the current page — click to use it for the quiz. */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/40 px-14 py-4">
              <button
                type="button"
                onClick={() => current && toggle(current.pageId)}
                disabled={!current || (!currentSelected && atLimit)}
                aria-pressed={currentSelected}
                className={cn(
                  "group relative flex h-full max-h-full items-center justify-center rounded-md transition-all",
                  !currentSelected && atLimit && "cursor-not-allowed",
                )}
              >
                {currentSrc ? (
                  <img
                    src={currentSrc}
                    alt={current ? t`Page ${current.pageNumber}` : ""}
                    className={cn(
                      "h-full max-h-full w-auto max-w-full rounded-md object-contain shadow-md ring-offset-2 ring-offset-background transition-all",
                      currentSelected
                        ? "ring-4 ring-orange-500"
                        : "ring-1 ring-border group-hover:ring-2 group-hover:ring-orange-300",
                    )}
                  />
                ) : (
                  <div className="flex h-full w-72 items-center justify-center rounded-md border bg-background">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                <span
                  className={cn(
                    "absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-sm transition-colors",
                    currentSelected
                      ? "bg-orange-500 text-white"
                      : "bg-background/90 text-muted-foreground group-hover:text-orange-600",
                  )}
                >
                  {currentSelected ? (
                    <>
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      {t`Used for this quiz`}
                    </>
                  ) : (
                    t`Click to use this page`
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                aria-label={t`Previous page`}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goTo(currentIndex + 1)}
                disabled={currentIndex >= renderedPages.length - 1}
                aria-label={t`Next page`}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              {current && (
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                  {t`Page ${current.pageNumber} of ${renderedPages.length}`}
                </span>
              )}
            </div>

            {/* Filmstrip with an insertion gap after each page. */}
            <div className="shrink-0 border-t bg-background">
              <div className="flex items-center justify-between px-6 pt-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {t`Pages`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t`Use the + between pages to place the quiz`}
                </span>
              </div>
              <div className="flex items-center gap-0 overflow-x-auto px-6 py-3">
                {renderedPages.map((page, index) => (
                  <div key={page.pageId} className="flex items-center">
                    <FilmstripThumb
                      bookLabel={bookLabel}
                      page={page}
                      isCurrent={index === currentIndex}
                      isSelected={selected.includes(page.pageId)}
                      selectDisabled={
                        !selected.includes(page.pageId) && atLimit
                      }
                      onNavigate={() => goTo(index)}
                      onToggleSelect={() => toggle(page.pageId)}
                    />
                    <InsertGap
                      active={afterPageId === page.pageId}
                      hasExistingQuiz={
                        (quizCountByAfterPageId.get(page.pageId) ?? 0) > 0
                      }
                      onSelect={() => pickPlacement(page.pageId)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {stageRunning && (
          <div className="mx-6 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
            <span>
              {t`Quizzes are generating. Wait for the run to finish before adding a quiz.`}
            </span>
          </div>
        )}

        {isOccupied && !generating && !stageRunning && (
          <div className="mx-6 flex flex-col gap-2.5 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2.5">
            <div className="flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {occupiedCount > 1
                  ? t`This position already has ${occupiedCount} quizzes. Add another after them, or replace them.`
                  : t`This position already has a quiz. Add another right after it, or replace it.`}
              </span>
            </div>
            <SegmentedControl
              options={placementOptions}
              value={placement}
              onValueChange={setPlacement}
              color="#ea580c"
              className="h-9 max-w-xs"
            />
          </div>
        )}

        {error && (
          <p className="px-6 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            {t`Cancel`}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={
              generating ||
              !hasStructuredTextProvider ||
              selected.length === 0 ||
              !afterPageId ||
              stageRunning
            }
            className="border-0 bg-orange-600 text-white hover:bg-orange-700"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t`Generating…`}
              </>
            ) : (
              generateLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
