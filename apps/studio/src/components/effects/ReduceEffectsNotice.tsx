import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { SETTINGS_ANCHORS } from "@/components/app/screens/settings/nav"
import { toast } from "@/components/ui/sonner"
import { lowEndReasons, markNoticeSeen, pendingNotice, readEffectsMode, readHardware, readNoticeSeen } from "@/lib/effects"
import { LowEndReasons } from "./LowEndReasons"

/**
 * Says once, in a toast, that Studio switched to reduced effects because this computer looks
 * low-end — and why, with a way to the setting. Silent when the user chose On or Off, when only the
 * OS asks for less motion, and in the first-run onboarding window (the main window says it).
 */
export function ReduceEffectsNotice() {
  const { t } = useLingui()
  const navigate = useNavigate()

  useEffect(() => {
    if (window.location.pathname.startsWith("/onboarding")) return
    const hw = readHardware()
    const reasons = pendingNotice(readEffectsMode(), lowEndReasons(hw), readNoticeSeen())
    if (reasons.length === 0) return
    markNoticeSeen(reasons)
    toast(t`Studio switched to reduced effects`, {
      description: (
        <Trans>
          So it stays smooth on this computer: <LowEndReasons reasons={reasons} hw={hw} />.
        </Trans>
      ),
      action: { label: t`Change in Settings`, onClick: () => void navigate({ to: "/settings/theme", hash: SETTINGS_ANCHORS.reduceEffects }) },
    })
  }, [])

  return null
}
