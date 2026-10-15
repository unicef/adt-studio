import { useRouterState } from "@tanstack/react-router"
import { setFriendlyStageNames } from "@/components/pipeline/pipeline-i18n"
import { LabSimulationDriver } from "./simulate"
import { GuideBar } from "./GuideBar"
import { LabPanel } from "./LabPanel"
import { NAV_LAB_PARAM, NavLab, useNavLab } from "./NavLab"
import { useLabDeepLink } from "./deepLink"
import { IN_LAB_FRAME } from "./frame"
import { useGuide } from "./testPlan/guide"
import { LAB_ENABLED, getVariant } from "./variants"

if (LAB_ENABLED) setFriendlyStageNames(() => getVariant("features") === "suggested")

export function VariantBar() {
  if (!LAB_ENABLED) return null
  return (
    <>
      <LabSimulationDriver />
      <LabChrome />
    </>
  )
}

function LabChrome() {
  useLabDeepLink()
  if (IN_LAB_FRAME) return null
  return <LabChromeBars />
}

function LabChromeBars() {
  const onLab = useRouterState({ select: (state) => state.location.pathname === "/lab" })
  const [guide] = useGuide()
  const [navLab] = useNavLab()
  if ((navLab.on || new URLSearchParams(window.location.search).has(NAV_LAB_PARAM)) && !onLab) return <NavLab />
  if (guide) return onLab ? null : <GuideBar />
  return <LabPanel />
}
