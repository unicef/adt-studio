import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export type EmptyStateColor =
  | "orange"
  | "teal"
  | "pink"
  | "violet"
  | "sky"
  | "blue"
  | "lime"
  | "amber"
  | "rose"
  | "cyan"
  | "fuchsia"

interface ColorClasses {
  iconBg: string
  iconColor: string
}

const COLOR_CLASSES: Record<EmptyStateColor, ColorClasses> = {
  orange: { iconBg: "bg-orange-50", iconColor: "text-orange-300" },
  teal: { iconBg: "bg-teal-50", iconColor: "text-teal-300" },
  pink: { iconBg: "bg-pink-50", iconColor: "text-pink-300" },
  violet: { iconBg: "bg-violet-50", iconColor: "text-violet-300" },
  sky: { iconBg: "bg-sky-50", iconColor: "text-sky-300" },
  blue: { iconBg: "bg-blue-50", iconColor: "text-blue-300" },
  lime: { iconBg: "bg-lime-50", iconColor: "text-lime-300" },
  amber: { iconBg: "bg-amber-50", iconColor: "text-amber-300" },
  rose: { iconBg: "bg-rose-50", iconColor: "text-rose-300" },
  cyan: { iconBg: "bg-cyan-50", iconColor: "text-cyan-300" },
  fuchsia: { iconBg: "bg-fuchsia-50", iconColor: "text-fuchsia-300" },
}

interface StageEmptyStateProps {
  icon: LucideIcon
  color: EmptyStateColor
  title: ReactNode
  subtitle?: ReactNode
  cta?: ReactNode
}

export function StageEmptyState({
  icon: Icon,
  color,
  title,
  subtitle,
  cta,
}: StageEmptyStateProps) {
  const { iconBg, iconColor } = COLOR_CLASSES[color]
  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground flex-1">
      <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center mb-3`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {subtitle && <p className="text-xs mt-1">{subtitle}</p>}
      {cta && <div className="mt-3">{cta}</div>}
    </div>
  )
}
