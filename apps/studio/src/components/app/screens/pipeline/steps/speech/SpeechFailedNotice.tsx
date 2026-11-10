import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { FileWarning, RotateCcw } from "lucide-react"
import { ProblemNotice } from "../shared/problems/ProblemNotice"

export function SpeechFailedNotice({
  hex,
  count,
  onShow,
  retry,
}: {
  hex: string
  count: number
  onShow: () => void
  retry: { onClick: () => void; disabled: boolean; reason: string | null }
}) {
  const { t } = useLingui()
  if (count === 0) return null
  return (
    <ProblemNotice
      level="partial"
      hex={hex}
      icon={FileWarning}
      title={t`${plural(count, { one: "# clip couldn't be created", other: "# clips couldn't be created" })}`}
      body={t`Everything else is fine. Show them to create each one again, or try them all at once.`}
      onShowItems={onShow}
      action={{
        label: t`Try again`,
        icon: RotateCcw,
        onClick: retry.onClick,
        disabled: retry.disabled,
        disabledReason: retry.reason ?? undefined,
      }}
    />
  )
}
