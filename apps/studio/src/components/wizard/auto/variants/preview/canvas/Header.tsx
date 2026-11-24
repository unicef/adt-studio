import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export type Moment = "reading" | "asking" | "ready" | "failed"

const GRADIENT = "bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent"

function Layer({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <h1 aria-hidden={!shown} className={cn("col-start-1 row-start-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[30px] font-bold leading-[1.05] tracking-[-0.035em] transition-[opacity,filter,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:text-[40px]", shown ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0 blur-[3px]")}>
      {children}
    </h1>
  )
}

/**
 * The canvas's one headline, and nothing under it: swapped in place as the moment changes, so
 * nothing below moves. A question carries its "1 of 2" counter. Errors bring their own title.
 */
export function Header({ moment, number, total, aside }: { moment: Moment; number: number; total: number; aside: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", moment === "failed" ? "justify-end" : "justify-between")}>
      <div className={cn("grid min-w-0", moment === "failed" && "hidden")}>
        <Layer shown={moment === "reading"}>
          <Trans>
            Building your <span className={GRADIENT}>preview</span>
          </Trans>
        </Layer>
        <Layer shown={moment === "asking"}>
          <span>
            <Trans>
              Which looks <span className={GRADIENT}>right</span>?
            </Trans>
          </span>
          {total > 1 && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[13px] font-semibold tracking-normal text-brand-700 ring-1 ring-brand-200">
              <Trans>
                {number} of {total}
              </Trans>
            </span>
          )}
        </Layer>
        <Layer shown={moment === "ready"}>
          <Trans>
            Here&apos;s your book, <span className={GRADIENT}>digital</span>
          </Trans>
        </Layer>
      </div>
      <div className="flex shrink-0 items-center gap-1">{aside}</div>
    </div>
  )
}
