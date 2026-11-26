import { useRef, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle, ArrowRight, BookOpenCheck, Check, FileText, FileUp, ListChecks, ScanSearch } from "lucide-react"
import { cn } from "@/lib/utils"
import { PrimaryButton } from "../../core/ui"
import type { UploadFlow } from "../../start/upload/useUploadFlow"
import { Attachment } from "./shared/Attachment"
import { LC_PRIMARY } from "./shared/Create"
import { Illustration } from "./shared/Illustration"
import { TourCoach, type CoachStop } from "./TourCoach"

/** The three steps ahead, shown above the drop zone (and walked through on a first run). */
const STEPS: { image: string; icon: ReactNode; title: ReactNode; text: ReactNode; says: ReactNode }[] = [
  {
    image: "step-read",
    icon: <ScanSearch className="size-5" />,
    title: <Trans>I read your PDF</Trans>,
    text: <Trans>A few seconds. I look at the pages to understand what kind of book it is.</Trans>,
    says: (
      <Trans>
        <strong className="font-semibold">First, I read your PDF.</strong> It takes a few seconds: I look at the pages to understand what kind of book it is.
      </Trans>
    ),
  },
  {
    image: "step-check",
    icon: <ListChecks className="size-5" />,
    title: <Trans>We check it together</Trans>,
    text: <Trans>A few quick choices, one at a time. I mark the ones I&apos;m sure of; you confirm or change them.</Trans>,
    says: (
      <Trans>
        <strong className="font-semibold">Then we check it together.</strong> A few quick choices, one at a time. I mark the ones I&apos;m sure of, and you confirm or change them.
      </Trans>
    ),
  },
  {
    image: "step-create",
    icon: <BookOpenCheck className="size-5" />,
    title: <Trans>I create the book</Trans>,
    text: <Trans>It opens in the editor, where you can review and change everything.</Trans>,
    says: (
      <Trans>
        <strong className="font-semibold">Last, I create the book.</strong> It opens in the editor, where you can review and change everything.
      </Trans>
    ),
  },
]

/**
 * The first-run tour's stops, on the page as it is (nothing moves): 0 the assistant introduces
 * itself, 1–3 one card each, 4 the drop zone. The assistant floats next to each (TourCoach).
 */
export const TOUR_STOPS = STEPS.length + 2

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
        <strong className="font-semibold">Got it.</strong> The PDF opens fine, so let&apos;s start.
      </Trans>
    )
  if (flow.file) return <Trans>Let me check that this PDF opens…</Trans>
  return (
    <Trans>
      <strong className="font-semibold">Drop a PDF and I&apos;ll read it.</strong> Then we check a few things together, and I create the book.
    </Trans>
  )
}

/** Which part of the page the tour points at: a card (0–2), the drop zone ("drop"), or nothing. */
type Focus = number | "drop" | null
const focusOf = (tour: number | null): Focus => (tour === null || tour === 0 ? null : tour <= STEPS.length ? tour - 1 : "drop")

/** In the tour, what it isn't pointing at steps back; what it points at is outlined. Nothing moves. */
const spot = (tour: number | null, me: Focus) => {
  if (tour === null) return ""
  const f = focusOf(tour)
  if (f === null) return "gd-spot-rest"
  return f === me ? "gd-spot-on" : "gd-spot-off"
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
          <Trans>{flow.pageCount} pages · ready</Trans>
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
        "min-h-[220px] lg:min-h-[clamp(240px,30vh,360px)]",
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
export function UploadPanel({ flow, rejected, onContinue, tour, onTour, onTourDone }: { flow: UploadFlow; rejected: boolean; onContinue: (() => void) | null; tour: number | null; onTour: (i: number) => void; onTourDone: () => void }) {
  const area = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLOListElement>(null)
  const cards = [useRef<HTMLLIElement>(null), useRef<HTMLLIElement>(null), useRef<HTMLLIElement>(null)]
  const drop = useRef<HTMLDivElement>(null)
  const stops: CoachStop[] = [
    {
      target: row,
      place: "over",
      says: (
        <Trans>
          <strong className="font-semibold">Hi! I&apos;m the ADT Assistant.</strong> I&apos;ll help you turn a PDF into an accessible digital book. Let me show you how it goes.
        </Trans>
      ),
    },
    ...STEPS.map((s, i): CoachStop => ({ target: cards[i]!, place: "below", says: s.says })),
    {
      target: drop,
      place: "over",
      says: (
        <Trans>
          <strong className="font-semibold">That&apos;s it.</strong> When you&apos;re ready, drop your PDF here.
        </Trans>
      ),
    },
  ]
  if (flow.file && flow.pageCount > 0 && !flow.error && onContinue)
    return (
      <div className="flex flex-col items-start gap-4">
        <Attachment flow={flow} frozen={false} />
        <PrimaryButton onClick={onContinue} icon={<ArrowRight className="size-4" />} className={cn(LC_PRIMARY, "flex-row-reverse")}>
          <Trans>Continue</Trans>
        </PrimaryButton>
      </div>
    )
  return (
    <div ref={area} className="relative flex flex-col gap-4 lg:gap-5">
      <ol ref={row} className="grid gap-3 sm:grid-cols-3 lg:gap-4">
        {STEPS.map((s, i) => (
          <li key={s.image} ref={cards[i]} className={cn("gd-spot lc-surface flex flex-row items-center gap-4 p-3 sm:flex-col sm:items-stretch sm:gap-3 lg:p-4", spot(tour, i))}>
            <span className="qd18-pv grid h-[84px] w-[112px] shrink-0 place-items-center overflow-hidden rounded-[14px] p-1.5 sm:h-[clamp(120px,17vh,210px)] sm:w-auto sm:p-3">
              <Illustration name={s.image} fallback={<span className="grid size-12 place-items-center rounded-full bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)]">{s.icon}</span>} />
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
      <div ref={drop} className={cn("gd-spot rounded-[22px]", spot(tour, "drop"))}>
        <DropZone flow={flow} rejected={rejected} />
      </div>
      {tour !== null && <TourCoach stops={stops} at={tour} area={area} onNext={() => onTour(tour + 1)} onDone={onTourDone} />}
    </div>
  )
}
