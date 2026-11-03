import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { NO_DRAG_REGION } from "@/constants"

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

  return (
    <nav
      aria-label={t`Location`}
      className="flex min-w-0 items-center gap-2.5 leading-5 animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-full text-white" style={{ background: data.hex }}>
          <Icon className="size-3" strokeWidth={2.4} />
        </span>
        <AreaName data={data} />
        {data.item && (
          <>
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate text-[13px] font-medium text-foreground/75">{data.item}</span>
          </>
        )}
      </span>
      {(data.version || data.note) && (
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground [&_button]:h-6! [&_button]:gap-1! [&_button]:rounded-md! [&_button]:px-1.5! [&_button]:text-[11.5px]!">
          {data.version && (
            <span style={NO_DRAG_REGION} className="flex shrink-0 items-center">
              {data.version}
            </span>
          )}
          {data.note && <span className="flex items-center gap-1 whitespace-nowrap">{data.note}</span>}
        </span>
      )}
    </nav>
  )
}
