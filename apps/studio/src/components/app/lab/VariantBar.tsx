import { useEffect, useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import { setFriendlyStageNames } from "@/components/pipeline/pipeline-i18n"
import { LabSimulationDriver } from "./simulate"
import { LabScenarioRefresh } from "./LabScenarioRefresh"
import { DOCK_SHOW_PARAM, DockShowcase } from "./dockShowcase/DockShowcase"
import { NavLab, setNavLabOn, useNavLab } from "./NavLab"
import { PlanMenu } from "./plan/PlanMenu"
import { useLabDeepLink } from "./deepLink"
import { IN_LAB_FRAME } from "./frame"
import { LAB_ENABLED, getVariant } from "./variants"

if (LAB_ENABLED) setFriendlyStageNames(() => getVariant("features") === "suggested")

export function VariantBar() {
  if (!LAB_ENABLED) return null
  return (
    <>
      <LabSimulationDriver />
      <LabScenarioRefresh />
      <LabChrome />
    </>
  )
}

function LabChrome() {
  useLabDeepLink()
  const [showcase, setShowcase] = useState(() => new URLSearchParams(window.location.search).has(DOCK_SHOW_PARAM))
  if (IN_LAB_FRAME) return null
  if (showcase)
    return (
      <DockShowcase
        onClose={() => {
          const url = new URL(window.location.href)
          url.searchParams.delete(DOCK_SHOW_PARAM)
          window.history.replaceState(window.history.state, "", url)
          setShowcase(false)
        }}
      />
    )
  return <LabChromeBars />
}

function LabChromeBars() {
  const onLab = useRouterState({ select: (state) => state.location.pathname === "/lab" })
  const [navLab] = useNavLab()
  useEffect(() => {
    if (!navLab.on) setNavLabOn(true)
  }, [navLab.on])
  if (onLab) return null
  return (
    <>
      <PlanMenu />
      <NavLab />
    </>
  )
}
