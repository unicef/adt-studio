import type { ReactNode } from "react"
import { Plural, Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export type Moment = "reading" | "asking" | "ready" | "failed"

const GRADIENT = "bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent"

function Layer({ shown, title, body }: { shown: boolean; title: ReactNode; body: ReactNode }) {
  return (
    <div aria-hidden={!shown} className={cn("col-start-1 row-start-1 flex flex-col gap-1.5 transition-[opacity,filter,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", shown ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0 blur-[3px]")}>
      <h1 className="text-[30px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[40px]">{title}</h1>
      <p className="max-w-[620px] text-[14.5px] leading-relaxed text-muted-foreground sm:text-[15.5px]">{body}</p>
    </div>
  )
}

/** The canvas's one headline, swapped in place as the moment changes so nothing below moves. */
export function Header({ moment, questions, aside }: { moment: Moment; questions: number; aside: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid min-w-0">
        <Layer
          shown={moment === "reading"}
          title={
            <Trans>
              Building your <span className={GRADIENT}>preview</span>
            </Trans>
          }
          body={<Trans>We&apos;re reading a few pages. The preview fills in as we learn about your book.</Trans>}
        />
        <Layer
          shown={moment === "asking"}
          title={
            <Trans>
              Which looks <span className={GRADIENT}>right</span>?
            </Trans>
          }
          body={<Plural value={questions} one="We weren't sure about one thing. Pick the one that matches your book." other="We weren't sure about # things. Pick the ones that match your book." />}
        />
        <Layer
          shown={moment === "ready"}
          title={
            <Trans>
              Here&apos;s your book, <span className={GRADIENT}>digital</span>
            </Trans>
          }
          body={<Trans>How it will read on screens. Change any setting and the preview follows.</Trans>}
        />
        <Layer
          shown={moment === "failed"}
          title={
            <Trans>
              Set up <span className={GRADIENT}>your book</span>
            </Trans>
          }
          body={<Trans>The preview needs the AI to read your book first. Your PDF is kept either way.</Trans>}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">{aside}</div>
    </div>
  )
}
