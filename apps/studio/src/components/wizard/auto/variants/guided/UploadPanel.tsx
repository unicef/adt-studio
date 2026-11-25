import { Trans } from "@lingui/react/macro"
import { ArrowRight, FileUp } from "lucide-react"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import { Attachment } from "./shared/Attachment"

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
      <strong className="font-semibold">Hi! Drop a PDF and I&apos;ll read it.</strong> I&apos;ll tell you what I find and set the book up with you.
    </Trans>
  )
}

/** Under the Upload bubble: the drop zone, or (back on this step) the PDF with its page choice. */
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
    <button
      type="button"
      onClick={flow.openPicker}
      className="gd-drop group flex w-full flex-col items-center gap-3 rounded-[20px] border-[1.5px] border-dashed border-border bg-[var(--lc-bubble)] px-6 py-12 text-center transition-[border-color,background-color] duration-200 hover:border-[var(--gd-step)]"
    >
      <span className="grid size-12 place-items-center rounded-full bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)] transition-transform duration-300 group-hover:-translate-y-0.5">
        <FileUp className="size-5" />
      </span>
      <span className="text-[16px] font-semibold">
        <Trans>Drop your PDF here</Trans>
      </span>
      <span className="text-[14px] text-muted-foreground">
        <Trans>
          or <span className="font-medium text-[var(--lc-accent-text)] underline decoration-brand-300 underline-offset-4">choose a file</span>
        </Trans>
      </span>
    </button>
  )
}
