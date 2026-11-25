import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowUp, Loader2, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import { COMPOSER_ATTR, rememberHandoff } from "../livechat/ideas/entrance/handoff"
import { NAME_INPUT } from "./Create"
import { useIdea } from "./ideas"
import { useLiving } from "./look"

/**
 * Where a chat's text box would be. Before the PDF it is the drop zone (the whole window takes a
 * drop too); after, it holds the replies that are always available, like "Set it up myself".
 */
export function Composer({ flow, replies, hint }: { flow: UploadFlow; replies: ReactNode; hint?: ReactNode }) {
  const { t } = useLingui()
  const hasFile = !!flow.file && !flow.error
  const drop = useHandoffSource(hasFile)
  const living = useLiving()
  // G34 tints the whole window, so a page-coloured fade above the composer would show as a band.
  const tinted = useIdea("ambient") === "g34" && living
  return (
    <div className="relative mx-auto w-full max-w-[760px] px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
      {!tinted && <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 -top-8 h-10", living ? "bg-background [mask-image:linear-gradient(to_top,black,transparent)]" : "bg-gradient-to-t from-background to-transparent")} />}
      {hasFile ? (
        <div {...{ [COMPOSER_ATTR]: "" }} className={cn("relative flex items-center gap-1.5 p-1.5", living ? "lc-surface rounded-[18px]" : "rounded-[26px] bg-card ring-1 ring-border shadow-[0_12px_32px_-18px_rgba(15,23,42,0.35)]")}>
          <button type="button" onClick={flow.openPicker} aria-label={t`Send another PDF`} className="hidden size-10 shrink-0 sm:grid place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.96]">
            <Paperclip className="size-[18px]" />
          </button>
          {hint && <span className="hidden min-w-0 flex-1 truncate pl-1 text-[14px] text-muted-foreground sm:block">{hint}</span>}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:flex-none sm:justify-end sm:gap-1.5 max-sm:[&>*:first-child]:ml-auto max-sm:[&>*:last-child]:mr-auto">{replies}</div>
        </div>
      ) : (
        <button
          ref={drop}
          type="button"
          onClick={flow.openPicker}
          className={cn(
            "group relative flex w-full items-center gap-3 p-2 pl-3 text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.995]",
            living
              ? "rounded-[18px] border-[1.5px] border-dashed border-input bg-[var(--lc-bubble)] shadow-[var(--lc-shadow)] hover:border-brand-400 hover:bg-brand-50/50"
              : "rounded-[26px] border-2 border-dashed border-brand-300 bg-card/90 shadow-[0_16px_40px_-22px_rgba(43,127,255,0.8)] backdrop-blur hover:border-brand-500 hover:bg-brand-50/60",
          )}
        >
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", living ? "bg-muted text-muted-foreground" : "bg-brand-50 text-brand-700 ring-1 ring-brand-200")}>
            {flow.loading ? <Loader2 className="size-[18px] animate-spin motion-reduce:animate-none" /> : <Paperclip className="size-[18px]" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn("truncate text-[15px]", living ? "font-medium" : "font-semibold")}>{flow.loading ? <Trans>Reading PDF…</Trans> : <Trans>Drop your PDF here</Trans>}</span>
            <span className="truncate text-[12.5px] text-muted-foreground">
              <Trans>
                or <span className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">browse your files</span>
              </Trans>
            </span>
          </span>
          <span className={cn("grid shrink-0 place-items-center rounded-full bg-brand-600 text-primary-foreground transition-transform duration-200 motion-reduce:transition-none", living ? "size-10" : "size-11 shadow-[0_8px_20px_-6px_rgba(43,127,255,0.8)] group-hover:-translate-y-0.5")}>
            <ArrowUp className="size-5" />
          </span>
        </button>
      )}
      {!hasFile && replies && <div className="mt-2 flex justify-center gap-1.5">{replies}</div>}
    </div>
  )
}

/**
 * Idea A2 (Living chat lab only): remembers where what the user sends was, so their bubble can
 * fly out of it. The drop zone for the PDF; the name field when they create the book. Other replies
 * fly out of the composer surface itself (marked with COMPOSER_ATTR).
 */
function useHandoffSource(hasFile: boolean) {
  const living = useLiving()
  const on = useIdea("entrance") === "a2" && living
  const drop = useRef<HTMLButtonElement>(null)
  const last = useRef<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (!on) return
    if (!hasFile && drop.current) last.current = drop.current.getBoundingClientRect()
    else if (hasFile && last.current) {
      rememberHandoff("pdf", last.current)
      last.current = null
    }
  })
  useEffect(() => {
    if (!on) return
    const fromName = (target: EventTarget | null) => {
      const input = document.getElementById(NAME_INPUT) as HTMLInputElement | null
      const card = input?.closest("[id^='msg-ready-']")
      if (input?.value.trim() && card?.contains(target as Node)) rememberHandoff("name", input.getBoundingClientRect())
    }
    const click = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest("button")) fromName(e.target)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter") fromName(e.target)
    }
    document.addEventListener("click", click, true)
    document.addEventListener("keydown", key, true)
    return () => {
      document.removeEventListener("click", click, true)
      document.removeEventListener("keydown", key, true)
    }
  }, [on])
  return drop
}

/** A quiet always-there reply in the composer. */
export function ComposerReply({ onClick, children, icon, accent }: { onClick: () => void; children: ReactNode; icon?: ReactNode; accent?: boolean }) {
  const living = useLiving()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13.5px] sm:px-3.5 transition-[background-color,transform,color] duration-150 active:scale-[0.97]",
        living ? "rounded-[12px] font-medium" : "font-semibold",
        accent ? "bg-brand-600 text-primary-foreground hover:bg-brand-600/90" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
