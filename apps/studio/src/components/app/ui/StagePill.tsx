import { ChevronDown } from "lucide-react"
import { Plural } from "@lingui/react/macro"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import type { StageDisc } from "../data"

export interface StagePillProps {
  discs: StageDisc[]
  className?: string
}

export function StagePill({ discs, className }: StagePillProps) {
  const furthest = discs.length ? discs[discs.length - 1].hex : "#c2c8d0"
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border bg-muted px-2.5 text-[11.5px] font-medium text-foreground transition-colors hover:bg-accent",
            className,
          )}
        >
          <span className="size-[7px] rounded-full" style={{ background: furthest }} />
          <Plural value={discs.length} one="# stage" other="# stages" />
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[250px] p-2">
        <div className="grid grid-cols-2 gap-x-1.5 gap-y-1">
          {discs.map((d) => {
            const Icon = d.icon
            return (
              <div key={d.slug} className="flex items-center gap-2 rounded-md px-1.5 py-1">
                <span
                  className="grid size-[18px] shrink-0 place-items-center rounded-full text-white"
                  style={{ background: d.hex }}
                >
                  <Icon className="size-[11px]" />
                </span>
                <span className="truncate text-[11.5px] font-medium">{getStageLabelI18n(d.slug)}</span>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
