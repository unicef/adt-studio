import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import type { LucideIcon } from "lucide-react"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"

export interface BarLocationData {
  icon: LucideIcon
  hex: string
  area: ReactNode
  onArea?: () => void
  item?: ReactNode
  version?: ReactNode
  note?: ReactNode
}

function AreaName({ data }: { data: BarLocationData }) {
  const className = "whitespace-nowrap text-[13px] font-semibold"
  if (!data.onArea || !data.item) return <span className={className}>{data.area}</span>
  return (
    <button
      type="button"
      onClick={data.onArea}
      style={NO_DRAG_REGION}
      className={`${className} -mx-1 rounded-md px-1 transition-colors duration-150 hover:bg-muted`}
    >
      {data.area}
    </button>
  )
}

export function BarLocation({ data }: { data: BarLocationData }) {
  const { t } = useLingui()
  const Icon = data.icon
  const hasSecond = data.item || data.version || data.note

  return (
    <nav
      aria-label={t`Location`}
      className="flex min-w-0 flex-col items-center gap-0.5 leading-tight animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      <span className="flex items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-full text-white" style={{ background: data.hex }}>
          <Icon className="size-3" strokeWidth={2.4} />
        </span>
        <AreaName data={data} />
      </span>
      {hasSecond && (
        <span
          className={cn(
            "flex min-w-0 items-center justify-center gap-1 text-[11.5px] text-muted-foreground",
            data.item
              ? "[&_button]:h-5! [&_button]:text-[11px]!"
              : "[&_button]:h-6! [&_button]:gap-1! [&_button]:rounded-md! [&_button]:px-2! [&_button]:text-[12px]! [&_button]:font-medium!",
          )}
        >
          {data.item && <span className="truncate">{data.item}</span>}
          {data.item && data.version && <span aria-hidden className="text-muted-foreground/50">·</span>}
          {data.version && (
            <span style={NO_DRAG_REGION} className="flex shrink-0 items-center">
              {data.version}
            </span>
          )}
          {data.note && <span className="whitespace-nowrap">{data.note}</span>}
        </span>
      )}
    </nav>
  )
}
