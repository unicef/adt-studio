import type { ReactNode } from "react"
import { RotateCcw, TriangleAlert } from "lucide-react"
import { NoticeStrip } from "@/components/ui/notice-strip"
import { STAGES } from "../stage-config"

type Variant = "prereq" | "cascade"

const ICON_BY_VARIANT = {
  prereq: TriangleAlert,
  cascade: RotateCcw,
} as const

export function LandingPageWarning({
  show = true,
  variant = "prereq",
  stageSlug,
  title,
  description,
}: {
  show?: boolean
  variant?: Variant
  stageSlug: string
  title: ReactNode
  description: ReactNode
}) {
  if (!show) return null
  const hex = STAGES.find((stage) => stage.slug === stageSlug)?.hex
  return <NoticeStrip tone="attention" hex={hex} icon={ICON_BY_VARIANT[variant]} title={title} body={description} />
}
