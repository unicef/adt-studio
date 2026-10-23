import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Sparkles } from "lucide-react"
import { StepRailHeader } from "@/components/app/screens/pipeline/rail/StepRailHeader"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"

export interface PluginRailEmptyProps {
  hex: string
  title: React.ReactNode
  pageCount: number
  sectionCount: number
  running?: boolean
}

export function PluginRailEmpty({ hex, title, pageCount, sectionCount, running = false }: PluginRailEmptyProps) {
  const { t } = useLingui()

  return (
    <>
      <StepRailHeader>{title}</StepRailHeader>

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
        {running ? (
          <Trans>Running now. Each page lands here as soon as it finishes.</Trans>
        ) : (
          <Trans>Nothing here yet. Results show up in this list once this step has run.</Trans>
        )}
      </p>

      <p className="mt-auto border-t pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
        {t`Book: ${pageCount} pages`}
        <br />
        {t`${plural(sectionCount, { one: "# section", other: "# sections" })}`}
      </p>
    </>
  )
}
