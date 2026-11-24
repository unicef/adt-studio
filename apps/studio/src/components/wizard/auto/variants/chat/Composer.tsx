import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowUp, Loader2, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"

/**
 * Where a chat's text box would be. Before the PDF it is the drop zone (the whole window takes a
 * drop too); after, it holds the replies that are always available, like "Set it up myself".
 */
export function Composer({ flow, replies, hint }: { flow: UploadFlow; replies: ReactNode; hint?: ReactNode }) {
  const { t } = useLingui()
  const hasFile = !!flow.file && !flow.error
  return (
    <div className="relative mx-auto w-full max-w-[760px] px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 h-10 bg-gradient-to-t from-background to-transparent" />
      {hasFile ? (
        <div className="relative flex items-center gap-1.5 rounded-[26px] bg-card p-1.5 ring-1 ring-border shadow-[0_12px_32px_-18px_rgba(15,23,42,0.35)]">
          <button type="button" onClick={flow.openPicker} aria-label={t`Send another PDF`} className="hidden size-10 shrink-0 sm:grid place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.96]">
            <Paperclip className="size-[18px]" />
          </button>
          {hint && <span className="hidden min-w-0 flex-1 truncate pl-1 text-[14px] text-muted-foreground sm:block">{hint}</span>}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:flex-none sm:justify-end sm:gap-1.5 max-sm:[&>*:first-child]:ml-auto max-sm:[&>*:last-child]:mr-auto">{replies}</div>
        </div>
      ) : (
        <button
          type="button"
          onClick={flow.openPicker}
          className="group relative flex w-full items-center gap-3 rounded-[26px] border-2 border-dashed border-brand-300 bg-card/90 p-2 pl-3 text-left shadow-[0_16px_40px_-22px_rgba(43,127,255,0.8)] backdrop-blur transition-[border-color,background-color,transform] duration-200 hover:border-brand-500 hover:bg-brand-50/60 active:scale-[0.995]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-200">
            {flow.loading ? <Loader2 className="size-[18px] animate-spin motion-reduce:animate-none" /> : <Paperclip className="size-[18px]" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold">{flow.loading ? <Trans>Reading PDF…</Trans> : <Trans>Drop your PDF here</Trans>}</span>
            <span className="truncate text-[12.5px] text-muted-foreground">
              <Trans>
                or <span className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">browse your files</span>
              </Trans>
            </span>
          </span>
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-primary-foreground shadow-[0_8px_20px_-6px_rgba(43,127,255,0.8)] transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none")}>
            <ArrowUp className="size-5" />
          </span>
        </button>
      )}
      {!hasFile && replies && <div className="mt-2 flex justify-center gap-1.5">{replies}</div>}
    </div>
  )
}

/** A quiet always-there reply in the composer. */
export function ComposerReply({ onClick, children, icon, accent }: { onClick: () => void; children: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13.5px] sm:px-3.5 font-semibold transition-[background-color,transform,color] duration-150 active:scale-[0.97]",
        accent ? "bg-brand-600 text-primary-foreground hover:bg-brand-600/90" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
