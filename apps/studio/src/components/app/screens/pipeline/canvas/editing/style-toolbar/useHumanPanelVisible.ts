import { useVariant } from "@/components/app/lab/variants"
import { aiPanelAvailable } from "@/components/app/screens/pipeline/plugins/AiEditPanel"
import { useRightPanelOpen } from "@/components/app/screens/pipeline/shared/panelFit"
import { useRightPanelTab } from "@/components/app/screens/pipeline/shared/rightPanelTab"

export function useHumanPanelVisible(): boolean {
  const [open] = useRightPanelOpen()
  const [tab] = useRightPanelTab()
  const agentTab = aiPanelAvailable(useVariant("ai"), "storyboard")
  return open && (!agentTab || tab === "edit")
}
