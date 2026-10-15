import type { ReactNode } from "react"
import { RotateCcw, TriangleAlert } from "lucide-react"

type Variant = "prereq" | "cascade"

const ICON_BY_VARIANT = {
  prereq: TriangleAlert,
  cascade: RotateCcw,
} as const

export function LandingPageWarning({
  show = true,
  variant = "prereq",
  title,
  description,
}: {
  show?: boolean
  variant?: Variant
  title: ReactNode
  description: ReactNode
}) {
  if (!show) return null
  const Icon = ICON_BY_VARIANT[variant]
  return (
    <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
      <Icon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 dark:text-amber-400" />
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-amber-800 dark:text-amber-200">{title}</span>
        <span className="text-[12px] text-amber-700 leading-relaxed dark:text-amber-300">
          {description}
        </span>
      </div>
    </div>
  )
}
