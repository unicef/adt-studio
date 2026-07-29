import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Trans } from "@lingui/react/macro"

type PromptStatusBadgesProps = {
  isUsingFallback: boolean
  isEditedGlobalVersion: boolean
}

export function PromptStatusBadges({
  isUsingFallback,
}: PromptStatusBadgesProps) {
  return (
    <>
      {isUsingFallback && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="h-6 cursor-help border-amber-200 bg-amber-50 px-2 text-[11px] font-medium text-amber-800 hover:bg-amber-50"
            >
              <Trans>Using fallback</Trans>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" variant="light" className="max-w-[340px] p-3 text-xs leading-5">
            <Trans>
              This model-specific prompt file does not exist yet. Saving while this model is selected creates a global prompt version for that model.
            </Trans>
          </TooltipContent>
        </Tooltip>
      )}
    </>
  )
}
