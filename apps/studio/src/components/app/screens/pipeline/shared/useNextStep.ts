import { useNavigate } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { useBookRun } from "@/hooks/use-book-run"
import { FOUNDATION_SLUGS } from "./dockSlugs"
import { usePipelineNavigation } from "./usePipelineNavigation"
import { STARTED, nextDependent } from "./nextDependent"
import { usePipelineState } from "./usePipelineState"

const NEXT_FOUNDATION: Record<string, string> = { extract: "sectioning", sectioning: "storyboard" }

export interface NextStep {
  slug: string
  name: string
  hex: string
  icon: LucideIcon
  open: () => void
}

function stageVisual(slug: string) {
  return STAGES.find((candidate) => candidate.slug === slug)
}

export function useNextStep(label: string, slug: string | undefined, options: { partial?: boolean } = {}): NextStep | null {
  const { stageState } = useBookRun()
  const nav = usePipelineNavigation(label)
  const navigate = useNavigate()
  const { foundations, plugins } = usePipelineState(label)
  if (!label || !slug) return null

  const target = (next: string): NextStep | null => {
    const visual = stageVisual(next)
    if (!visual) return null
    const open =
      next === "storyboard"
        ? nav.openWorkspace
        : next === "preview"
          ? () => nav.openPreview(null)
          : next === "export"
            ? () => void navigate({ to: "/pipeline/$label/export", params: { label } })
            : () => nav.openStep(next)
    return { slug: next, name: getStageLabelI18n(next), hex: visual.hex, icon: visual.icon, open }
  }

  if ((FOUNDATION_SLUGS as readonly string[]).includes(slug)) {
    const next = NEXT_FOUNDATION[slug]
    if (!next || STARTED.has(stageState(next))) return null
    const state = stageState(slug)
    if (state !== "done" && !(options.partial === true && state === "error")) return null
    return target(next)
  }

  const own = plugins.find((item) => item.slug === slug)?.state
  if (own !== "done" && !(options.partial === true && own === "error")) return null
  if (slug === "validation") return target("export")
  return target(nextDependent(slug, [...foundations, ...plugins]) ?? "preview")
}
