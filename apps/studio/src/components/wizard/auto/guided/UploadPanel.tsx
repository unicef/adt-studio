import { Trans } from "@lingui/react/macro"
import type { ReactNode } from "react"
import { ArrowRight, BookOpenCheck, FileUp, ListChecks, ScanSearch } from "lucide-react"
import type { UploadFlow } from "../../start/upload/useUploadFlow"
import { Attachment } from "./shared/Attachment"
import { Illustration } from "./shared/Illustration"

/** Upload's bubble: what to do, or what went wrong with the file. */
export function UploadSays({ flow, rejected }: { flow: UploadFlow; rejected: boolean }) {
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
  return (
    <Trans>
      <strong className="font-semibold">Hi! I&apos;m the ADT Assistant.</strong> Give me a PDF and I&apos;ll help you turn it into an accessible digital book. Here&apos;s how it goes.
    </Trans>
  )
}

function Step({ n, image, icon, title, children }: { n: number; image: string; icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <li className="lc-surface flex flex-row items-center gap-4 p-3 sm:flex-col sm:items-stretch sm:gap-3 lg:p-4">
      <span className="qd18-pv grid h-[84px] w-[112px] shrink-0 place-items-center overflow-hidden rounded-[14px] p-1.5 sm:h-[clamp(130px,19vh,230px)] sm:w-auto sm:p-3">
        <Illustration name={image} fallback={<span className="grid size-12 place-items-center rounded-full bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)]">{icon}</span>} />
      </span>
      <span className="flex min-w-0 flex-col gap-1 sm:px-1 sm:pb-1">
        <span className="flex items-center gap-2 text-[15.5px] font-semibold leading-tight lg:text-[17px]">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--gd-step)] text-[12px] font-semibold text-primary-foreground">{n}</span>
          {title}
        </span>
        <span className="text-[13.5px] leading-snug text-muted-foreground lg:text-[14.5px]">{children}</span>
      </span>
    </li>
  )
}

/** The three steps ahead, before any PDF: what happens, so nothing after is a surprise. */
function HowItGoes() {
  return (
    <ol className="grid gap-3 sm:grid-cols-3 lg:gap-4">
      <Step n={1} image="step-read" icon={<ScanSearch className="size-5" />} title={<Trans>I read your PDF</Trans>}>
        <Trans>A few seconds. I look at the pages to understand what kind of book it is.</Trans>
      </Step>
      <Step n={2} image="step-check" icon={<ListChecks className="size-5" />} title={<Trans>We check it together</Trans>}>
        <Trans>A few quick choices, one at a time. I mark the ones I&apos;m sure of; you confirm or change them.</Trans>
      </Step>
      <Step n={3} image="step-create" icon={<BookOpenCheck className="size-5" />} title={<Trans>I create the book</Trans>}>
        <Trans>It opens in the editor, where you can review and change everything.</Trans>
      </Step>
    </ol>
  )
}

/** Under the Upload bubble: how it goes and the drop zone, or (back on this step) the PDF with its page choice. */
export function UploadPanel({ flow, onContinue }: { flow: UploadFlow; onContinue: (() => void) | null }) {
  if (flow.file && flow.pageCount > 0 && !flow.error)
    return (
      <div className="flex flex-col items-start gap-4">
        <Attachment flow={flow} frozen={false} />
        {onContinue && (
          <button type="button" onClick={onContinue} className="lc-btn h-11 px-5 text-[14.5px]">
            <Trans>Continue</Trans>
            <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    )
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <HowItGoes />
      <button
        type="button"
        onClick={flow.openPicker}
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
