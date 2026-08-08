import { Trans, useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { tint } from "./plugins"

export interface PluginRailEmptyProps {
  hex: string
  title: React.ReactNode
  pageCount: number
  sectionCount: number
}

/** Plugin left rail before the first run: a hint of what will be indexed here. */
export function PluginRailEmpty({ hex, title, pageCount, sectionCount }: PluginRailEmptyProps) {
  const { t } = useLingui()

  return (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </span>

      <div aria-hidden className="relative flex h-28 items-center justify-center">
        <span className="absolute left-3.5 top-3.5 h-[82px] w-16 -rotate-[8deg] rounded-md border bg-card" />
        <span className="absolute left-6.5 top-2.5 h-[82px] w-16 rotate-[5deg] rounded-md border bg-card" />
        <span
          className="absolute left-5 top-1 flex h-[84px] w-[66px] flex-col gap-1.5 rounded-md border bg-card p-2 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.35)]"
          style={{ borderColor: tint(hex, 0.35) }}
        >
          <span className="h-1 w-full rounded-full bg-border" />
          <span className="h-1 w-[78%] rounded-full bg-border" />
          <span className="h-2 w-[56%] rounded-[3px]" style={{ background: tint(hex, 0.25) }} />
          <span className="h-1 w-[92%] rounded-full bg-border" />
          <span className="h-1 w-[64%] rounded-full bg-border" />
          <span className="h-2 w-[44%] rounded-[3px]" style={{ background: tint(hex, 0.12) }} />
        </span>
        <span
          className="absolute bottom-2 right-1.5 grid size-[22px] place-items-center rounded-full text-white"
          style={{ background: hex }}
        >
          <Sparkles className="size-3" />
        </span>
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        <Trans>Nothing here yet. Pages with results show up in this list after the scan.</Trans>
      </p>

      <p className="mt-auto border-t pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
        {t`Book: ${pageCount} pages`}
        <br />
        {t`${sectionCount} sections`}
      </p>
    </>
  )
}
