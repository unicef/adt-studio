import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight, BookOpenCheck, FileUp, ListChecks, ScanSearch } from "lucide-react"
import { cn } from "@/lib/utils"
import { PrimaryButton } from "../../core/ui"
import { LC_PRIMARY } from "./shared/Create"
import type { UploadFlow } from "../../start/upload/useUploadFlow"
import { Attachment } from "./shared/Attachment"
import { Illustration } from "./shared/Illustration"
import { morph } from "./shared/motion"
import { ReadingCard } from "./shared/Reading"

/** The three steps ahead, for the first-run tour and the row above the drop zone. */
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
export const TOUR_LENGTH = STEPS.length

/** Upload's bubble: the tour step, what to do, or what went wrong with the file. */
export function UploadSays({ flow, rejected, tour }: { flow: UploadFlow; rejected: boolean; tour: number | null }) {
  if (flow.file && flow.error === "password")
    return (
      <Trans>
        <strong className="font-semibold">This PDF is password-protected.</strong> Remove the password, or drop another file.
      </Trans>
    )
  if (flow.file && flow.error)
    return (
      <Trans>
        <strong className="font-semibold">I couldn&apos;t open this PDF.</strong> It may be damaged. Export it again, or drop another file.
      </Trans>
    )
  if (rejected)
    return (
      <Trans>
        <strong className="font-semibold">That file isn&apos;t a PDF.</strong> Drop a PDF and I&apos;ll read it.
      </Trans>
    )
  if (flow.file && flow.pageCount > 0) return <Trans>This is the PDF I read. Choose which pages to convert, or drop another PDF to start again.</Trans>
  if (flow.file) return <Trans>Opening your PDF…</Trans>
  if (tour === 0)
    return (
      <Trans>
        <strong className="font-semibold">Hi! I&apos;m the ADT Assistant.</strong> I&apos;ll help you turn a PDF into an accessible digital book. Let me show you how it goes, in three steps.
      </Trans>
    )
  if (tour !== null) return STEPS[tour]!.says
  return (
    <Trans>
      <strong className="font-semibold">Drop a PDF and I&apos;ll read it.</strong> Then we check a few things together, and I create the book.
    </Trans>
  )
}

function Picture({ image, icon, className }: { image: string; icon: ReactNode; className?: string }) {
  return (
    <span className={cn("qd18-pv grid place-items-center overflow-hidden rounded-[14px]", className)}>
      <Illustration name={image} fallback={<span className="grid size-12 place-items-center rounded-full bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)]">{icon}</span>} />
    </span>
  )
}

/** The first-run tour: one step at a time, big, with dots, Back / Next and Skip. It ends on the drop zone. */
function Tour({ at, onAt, onDone }: { at: number; onAt: (i: number) => void; onDone: () => void }) {
  const step = STEPS[at]!
  const last = at === STEPS.length - 1
  return (
    <div className="flex flex-col gap-5">
      <div className="lc-surface flex flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-center lg:gap-10 lg:p-8" style={{ viewTransitionName: "gd-drop" }}>
        <Picture image={step.image} icon={step.icon} className="h-[200px] w-full shrink-0 p-4 lg:h-[clamp(260px,40vh,440px)] lg:w-[58%]" />
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-[13px] font-medium uppercase tracking-[0.08em] text-[var(--gd-step-ink)]">
            <Trans>
              Step {at + 1} of {STEPS.length}
            </Trans>
          </span>
          <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] lg:text-[32px]">{step.title}</h2>
          <p className="text-[16px] leading-relaxed text-muted-foreground lg:text-[18px]">{step.text}</p>
          <span aria-hidden className="mt-2 flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={cn("gd-tour-dot h-2 rounded-full", i === at ? "w-6 bg-[var(--gd-step)]" : "w-2 bg-border")} />
            ))}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        {at > 0 ? (
          <button type="button" onClick={() => morph(() => onAt(at - 1))} className="lc-link -ml-2 inline-flex min-h-11 items-center gap-1.5 px-3 text-[14.5px] font-medium">
            <ArrowLeft className="size-4" />
            <Trans>Back</Trans>
          </button>
        ) : (
          <button type="button" onClick={() => morph(onDone)} className="-ml-2 inline-flex min-h-11 items-center rounded-full px-3 text-[14px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
            <Trans>Skip, I know how it works</Trans>
          </button>
        )}
        <PrimaryButton onClick={() => morph(() => (last ? onDone() : onAt(at + 1)))} icon={<ArrowRight className="size-4" />} className={cn(LC_PRIMARY, "h-12 min-w-[176px] flex-row-reverse px-7 text-[15.5px]")}>
          {last ? <Trans>Choose my PDF</Trans> : <Trans>Next</Trans>}
        </PrimaryButton>
      </div>
    </div>
  )
}

function StepsRow() {
  return (
    <ol className="grid gap-3 sm:grid-cols-3 lg:gap-4">
      {STEPS.map((s, i) => (
        <li key={s.image} className="gd-rise lc-surface flex flex-row items-center gap-4 p-3 sm:flex-col sm:items-stretch sm:gap-3 lg:p-4" style={{ animationDelay: `${i * 70}ms` }}>
          <Picture image={s.image} icon={s.icon} className="h-[84px] w-[112px] shrink-0 p-1.5 sm:h-[clamp(120px,17vh,210px)] sm:w-auto sm:p-3" />
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
  )
}

/**
 * Under the Upload bubble. A first run gets the tour (`tour` is its step). Then the three steps
 * and the drop zone; once a PDF is dropped the drop zone turns into the PDF being opened (Reading
 * carries on in the same place); back on this step later, the PDF with its page choice.
 */
export function UploadPanel({ flow, onContinue, tour, onTour, onTourDone }: { flow: UploadFlow; onContinue: (() => void) | null; tour: number | null; onTour: (i: number) => void; onTourDone: () => void }) {
  if (flow.file && flow.pageCount > 0 && !flow.error && onContinue)
    return (
      <div className="flex flex-col items-start gap-4">
        <Attachment flow={flow} frozen={false} />
        <PrimaryButton onClick={onContinue} icon={<ArrowRight className="size-4" />} className={cn(LC_PRIMARY, "flex-row-reverse")}>
          <Trans>Continue</Trans>
        </PrimaryButton>
      </div>
    )
  if (flow.file && !flow.error) return <ReadingCard file={flow.file} pageCount={flow.pageCount} />
  if (tour !== null) return <Tour at={tour} onAt={onTour} onDone={onTourDone} />
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <StepsRow />
      <button
        type="button"
        onClick={flow.openPicker}
        style={{ viewTransitionName: "gd-drop" }}
        className="gd-drop group flex w-full flex-col items-center gap-3 rounded-[22px] border-2 border-dashed border-border bg-[var(--lc-bubble)] px-6 py-12 text-center transition-[border-color,background-color] duration-200 hover:border-[var(--gd-step)] lg:py-[clamp(48px,8vh,96px)]"
      >
        <span className="grid size-14 place-items-center rounded-full bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)] transition-transform duration-300 group-hover:-translate-y-0.5 lg:size-16">
          <FileUp className="size-6 lg:size-7" />
        </span>
        <span className="text-[17px] font-semibold lg:text-[20px]">
          <Trans>Drop your PDF here</Trans>
        </span>
        <span className="text-[14.5px] text-muted-foreground lg:text-[15.5px]">
          <Trans>
            or <span className="font-medium text-[var(--lc-accent-text)] underline decoration-brand-300 underline-offset-4">choose a file</span>
          </Trans>
        </span>
      </button>
    </div>
  )
}
