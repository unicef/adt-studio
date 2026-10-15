import type { LucideIcon } from "lucide-react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { useBookRun } from "@/hooks/use-book-run"
import { usePipelineNavigation } from "./usePipelineNavigation"

const NEXT_FOUNDATION: Record<string, string> = { extract: "sectioning", sectioning: "storyboard" }
const STARTED = new Set(["done", "running", "queued"])

export interface NextStep {
  slug: string
  name: string
  hex: string
  icon: LucideIcon
  open: () => void
}

export function useNextStep(label: string, slug: string | undefined, options: { partial?: boolean } = {}): NextStep | null {
  const { stageState } = useBookRun()
  const nav = usePipelineNavigation(label)
  const next = slug ? NEXT_FOUNDATION[slug] : undefined
  if (!label || !slug || !next || STARTED.has(stageState(next))) return null
  const state = stageState(slug)
  if (state !== "done" && !(options.partial === true && state === "error")) return null
  const stage = STAGES.find((candidate) => candidate.slug === next)
  if (!stage) return null
  return {
    slug: next,
    name: getStageLabelI18n(next),
    hex: stage.hex,
    icon: stage.icon,
    open: () => (next === "storyboard" ? nav.openWorkspace() : nav.openStep(next)),
  }
}
