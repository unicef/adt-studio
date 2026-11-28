import { useRef, type ReactNode } from "react"
import { Plural, Trans } from "@lingui/react/macro"
import { AlertTriangle, ArrowRight, PlayCircle, BookOpenCheck, Check, FileText, FileUp, ListChecks, ScanSearch } from "lucide-react"
import { cn } from "@/lib/utils"
import { PrimaryButton } from "../../core/ui"
import type { UploadFlow } from "../../start/upload/useUploadFlow"
import { Attachment } from "./shared/Attachment"
import { LC_PRIMARY } from "./shared/Create"
import { useAssistantName } from "./shared/Assistant"
import type { Pose } from "./shared/WizardPose"
import { Illustration } from "../../core/Illustration"
import { TourCoach, type CoachStop, type Side } from "./TourCoach"

/** Where the assistant stands for each card, so the tour moves around instead of down a line. */
const SIDES: Side[] = ["right", "below", "left"]
/** The book wizard's pose at each card. */
const POSES: Pose[] = ["reading", "thinking", "celebrate"]

/** The three steps ahead, shown above the drop zone (and walked through on a first run). */
const STEPS: { image: string; icon: ReactNode; title: ReactNode; text: ReactNode; says: ReactNode }[] = [
  {
    image: "step-read",
    icon: <ScanSearch className="size-5" />,
    title: <Trans>I read your PDF</Trans>,
    text: <Trans>A few seconds. I look at some pages to understand what kind of book it is. Nothing is converted yet.</Trans>,
    says: (
      <Trans>
        <strong className="font-semibold">I start by reading.</strong> Even a long book stays quick, because I only look at a sample of its pages.
      </Trans>
    ),
  },
  {
    image: "step-check",
    icon: <ListChecks className="size-5" />,
    title: <Trans>We pick the settings together</Trans>,
    text: <Trans>A few quick choices, one at a time: the kind of book, its language, how the pages look, which pages to convert.</Trans>,
    says: (
      <Trans>
        <strong className="font-semibold">You stay in charge.</strong> I read your book twice, looking at it a different way each time: when both readings agree I&apos;m sure and you just confirm; when they don&apos;t, I ask you instead of guessing.
      </Trans>
    ),
  },
  {
    image: "step-create",
    icon: <BookOpenCheck className="size-5" />,
    title: <Trans>I set up the book</Trans>,
    text: <Trans>With those settings. That&apos;s when the conversion starts, and you follow and review it in the editor.</Trans>,
    says: (
      <Trans>
        <strong className="font-semibold">Nothing here is final.</strong> You can change the settings later in the editor, except the few I mark as fixed once the book is set up.
      </Trans>
    ),
  },
]


/** Upload's bubble: what to do, or what the drop zone found. */
export function UploadSays({ flow, rejected }: { flow: UploadFlow; rejected: boolean }) {
  if (flow.file && flow.error === "password")
    return (
      <Trans>
        <strong className="font-semibold">This PDF is password-protected.</strong> Remove the password, or choose another file.
      </Trans>
    )
  if (flow.file && flow.error)
    return (
      <Trans>
        <strong className="font-semibold">I couldn&apos;t open this PDF.</strong> It may be damaged. Export it again, or choose another file.
      </Trans>
    )
  if (rejected)
    return (
      <Trans>
        <strong className="font-semibold">That file isn&apos;t a PDF.</strong> Choose a PDF and I&apos;ll read it.
      </Trans>
    )
  if (flow.file && flow.pageCount > 0)
    return (
      <Trans>
        <strong className="font-semibold">Got it.</strong> The PDF opens fine, so let&apos;s set it up.
      </Trans>
    )
  if (flow.file) return <Trans>Let me check that this PDF opens…</Trans>
  return (
    <Trans>
      <strong className="font-semibold">Drop a PDF and I&apos;ll read it.</strong> Together we pick the best settings for this book; the conversion starts only after you set it up.
    </Trans>
  )
}

/** The drop zone, and the checks on the PDF dropped in it: opening, then OK or why not. Same box throughout. */
function DropZone({ flow, rejected }: { flow: UploadFlow; rejected: boolean }) {
  const name = flow.file?.name
  let body: ReactNode
  let tone: "idle" | "busy" | "ok" | "bad" = "idle"
  if (flow.file && flow.error) {
    tone = "bad"
    body = (
      <>
        <Badge tone="bad" icon={<AlertTriangle className="size-6 lg:size-7" />} />
        <span className="max-w-full truncate text-[17px] font-semibold lg:text-[20px]">{name}</span>
        <span className="text-[14.5px] text-destructive lg:text-[15.5px]">{flow.error === "password" ? <Trans>It&apos;s password-protected.</Trans> : <Trans>It can&apos;t be opened. It may be damaged.</Trans>}</span>
        <Again />
      </>
    )
  } else if (rejected && !flow.file) {
    tone = "bad"
    body = (
      <>
        <Badge tone="bad" icon={<AlertTriangle className="size-6 lg:size-7" />} />
        <span className="text-[17px] font-semibold lg:text-[20px]">
          <Trans>That file isn&apos;t a PDF</Trans>
        </span>
        <Again />
      </>
    )
  } else if (flow.file && flow.pageCount > 0) {
    tone = "ok"
    body = (
      <>
        <Badge tone="ok" icon={<Check className="size-7 stroke-[3] lg:size-8" />} />
        <span className="max-w-full truncate text-[17px] font-semibold lg:text-[20px]">{name}</span>
        <span className="text-[14.5px] text-muted-foreground lg:text-[15.5px]">
          <Plural value={flow.pageCount} one="# page · ready" other="# pages · ready" />
        </span>
      </>
    )
  } else if (flow.file) {
    tone = "busy"
    body = (
      <>
        <Badge tone="busy" icon={<FileText className="size-6 lg:size-7" />} />
        <span className="max-w-full truncate text-[17px] font-semibold lg:text-[20px]">{name}</span>
        <span className="text-[14.5px] text-muted-foreground lg:text-[15.5px]">
          <Trans>Checking the PDF…</Trans>
        </span>
        <span aria-hidden className="gd-reading-bar mt-1 h-1.5 w-full max-w-[320px] overflow-hidden rounded-full bg-muted">
          <span />
        </span>
      </>
    )
  } else {
    body = (
      <>
        <Badge tone="idle" icon={<FileUp className="size-6 lg:size-7" />} />
        <span className="text-[17px] font-semibold lg:text-[20px]">
          <Trans>Drop your PDF here</Trans>
        </span>
        <span className="text-[14.5px] text-muted-foreground lg:text-[15.5px]">
          <Trans>
            or <span className="font-medium text-[var(--lc-accent-text)] underline decoration-brand-300 underline-offset-4">choose a file</span>
          </Trans>
        </span>
      </>
    )
  }
  const busy = tone === "busy" || tone === "ok"
  return (
    <button
      type="button"
      onClick={busy ? undefined : flow.openPicker}
      aria-disabled={busy || undefined}
      data-tone={tone}
      className={cn(
        "gd-drop group flex w-full flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed bg-[var(--lc-bubble)] px-6 text-center transition-[border-color,background-color] duration-300",
        "min-h-[180px] lg:min-h-[max(150px,calc(clamp(180px,calc(var(--gd-vh,1vh)*26),360px)-var(--gd-squeeze,0px)))]",
        tone === "idle" && "border-border hover:border-[var(--gd-step)]",
        tone === "busy" && "cursor-default border-[var(--gd-step)]",
        tone === "ok" && "cursor-default border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10",
        tone === "bad" && "border-destructive/60",
      )}
    >
      <span role="status" className="contents">
        {body}
      </span>
    </button>
  )
}

function Badge({ tone, icon }: { tone: "idle" | "busy" | "ok" | "bad"; icon: ReactNode }) {
  return (
    <span
      className={cn(
        "grid size-14 place-items-center rounded-full transition-colors duration-300 lg:size-16",
        tone === "ok" ? "gd-pop bg-emerald-500 text-white" : tone === "bad" ? "bg-destructive/10 text-destructive" : "bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)]",
        tone === "busy" && "gd-breathe",
      )}
    >
      {icon}
    </span>
  )
}

function Again() {
  return (
    <span className="mt-1 text-[14.5px] font-medium text-[var(--lc-accent-text)] underline decoration-brand-300 underline-offset-4">
      <Trans>Choose another file</Trans>
    </span>
  )
}

/**
 * Under the Upload bubble: the three steps and the drop zone, which stays put while the PDF in it
 * is checked (opening, then OK or why not). A first run walks through the page with a spotlight
 * (`tour`). Back on this step later: the PDF with its page choice.
 */
export function UploadPanel({ flow, rejected, onContinue, tour, onTour, onTourDone, onTourAgain }: { flow: UploadFlow; rejected: boolean; onContinue: (() => void) | null; tour: number | null; onTour: (i: number) => void; onTourDone: () => void; onTourAgain: () => void }) {
  const cards = [useRef<HTMLLIElement>(null), useRef<HTMLLIElement>(null), useRef<HTMLLIElement>(null)]
  const drop = useRef<HTMLDivElement>(null)
  const name = useAssistantName()
  const stops: CoachStop[] = [
    {
      target: null,
      side: "center",
      pose: "hello",
      says: (
        <Trans>
          <strong className="font-semibold">Hi! I&apos;m the {name}.</strong> Before a book is converted, I help you set it up: I read your PDF and we pick the best settings for it together. For now I help only here, when you add a book; later I&apos;ll help in other parts of ADT Studio too.
        </Trans>
      ),
    },
    ...STEPS.map((s, i): CoachStop => ({ target: cards[i]!, side: SIDES[i]!, says: s.says, pose: POSES[i] })),
    {
      target: drop,
      side: "above",
      pose: "hello",
      says: (
        <Trans>
          <strong className="font-semibold">Ready when you are.</strong> I check the PDF opens before we start, so a damaged or password-protected file is caught right away.
        </Trans>
      ),
    },
  ]
  if (flow.file && flow.pageCount > 0 && !flow.error && onContinue)
    return (
      <div className="flex flex-col items-start gap-4">
        <Attachment flow={flow} />
        <PrimaryButton onClick={onContinue} icon={<ArrowRight className="size-4" />} className={cn(LC_PRIMARY, "flex-row-reverse")}>
          <Trans>Continue</Trans>
        </PrimaryButton>
      </div>
    )
  return (
    <div className="relative flex flex-col gap-4 lg:gap-5">
      <ol className="grid gap-3 sm:grid-cols-3 lg:gap-4">
        {STEPS.map((s, i) => (
          <li key={s.image} ref={cards[i]} className={cn("lc-surface flex flex-row items-center gap-4 p-3 sm:flex-col sm:items-stretch sm:gap-3 lg:p-4")}>
            <span className="qd18-pv grid h-[84px] w-[112px] shrink-0 place-items-center overflow-hidden rounded-[14px] p-1.5 sm:h-[max(80px,calc(clamp(96px,calc(var(--gd-vh,1vh)*15),210px)-var(--gd-squeeze,0px)))] sm:w-auto sm:p-3">
              <Illustration key={s.image} name={`${s.image}-wizard`} fallback={<span className="grid size-12 place-items-center rounded-full bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)]">{s.icon}</span>} />
            </span>
            <span className="flex min-w-0 flex-col gap-1 sm:px-1 sm:pb-1">
              <span className="flex items-center gap-2 text-[15.5px] font-semibold leading-tight lg:text-[17px]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--gd-step)] text-[12px] font-semibold text-primary-foreground">{i + 1}</span>
                {s.title}
              </span>
              <span className="text-[13.5px] leading-snug text-muted-foreground lg:text-[14.5px]">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div ref={drop} className="rounded-[22px]">
        <DropZone flow={flow} rejected={rejected} />
      </div>
      {tour === null && (!flow.file || !!flow.error) && (
        <div className="flex justify-center">
          <button type="button" onClick={onTourAgain} className="lc-link inline-flex min-h-10 items-center gap-1.5 px-3 text-[13.5px] font-medium">
            <PlayCircle className="size-4" />
            <Trans>Take the tour again</Trans>
          </button>
        </div>
      )}
      {tour !== null && <TourCoach stops={stops} at={tour} onNext={() => onTour(tour + 1)} onBack={() => onTour(tour - 1)} onDone={onTourDone} />}
    </div>
  )
}
