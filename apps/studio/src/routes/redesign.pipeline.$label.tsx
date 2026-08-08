import { createFileRoute } from "@tanstack/react-router"
import { PipelineScreen } from "@/components/redesign/screens/PipelineScreen"
import { isPluginSlug, type PluginSlug } from "@/components/redesign/screens/pipeline/plugins"

export interface PipelineSearch {
  plugin?: PluginSlug
}

export const Route = createFileRoute("/redesign/pipeline/$label")({
  component: PipelineScreen,
  validateSearch: (search: Record<string, unknown>): PipelineSearch => {
    const plugin = search.plugin
    return typeof plugin === "string" && isPluginSlug(plugin) ? { plugin } : {}
  },
})
