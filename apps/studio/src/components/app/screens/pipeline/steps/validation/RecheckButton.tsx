import { Trans } from "@lingui/react/macro"
import { RotateCcw } from "lucide-react"
import { useVariant } from "@/components/app/lab/variants"
import { cn } from "@/lib/utils"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED, HeaderButtonTile } from "../shared/headerButton"

export function RecheckButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const friendly = useVariant("features") === "suggested"
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED)}>
      <HeaderButtonTile icon={RotateCcw} />
      {friendly ? <Trans>Re-check</Trans> : <Trans>Refresh validation</Trans>}
    </button>
  )
}
