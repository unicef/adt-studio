import { useEffect, useState } from "react"
import { useLocation, useSearch } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { Plus, RefreshCw, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { StepperInput } from "@/components/ui/stepper-input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PROVIDER_CARDS } from "./data"
import { EASE } from "./shared"
import { ComingSoon } from "../ui"
import { useProviders } from "./useProviders"
import { ProviderCardGroups } from "./ProviderCardGroups"
import { providerFromAnchor } from "../nav"

export function ProvidersList() {
  const { t } = useLingui()
  const store = useProviders()
  const queryClient = useQueryClient()
  const { hash } = useLocation()
  const { auth } = useSearch({ strict: false })
  const linkedCard = hash ? providerFromAnchor(hash) : null
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (linkedCard && PROVIDER_CARDS[linkedCard]) setOpenId(linkedCard)
  }, [linkedCard])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["providers"] })
    void queryClient.invalidateQueries({ queryKey: ["provider-health"] })
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-end gap-2 text-muted-foreground">
          <button
            type="button"
            onClick={refresh}
            className={cn("grid size-7 place-items-center rounded-md transition-colors duration-150 hover:bg-muted hover:text-foreground motion-safe:active:scale-[0.95]", EASE)}
            aria-label={t`Refresh all providers`}
          >
            <RefreshCw className="size-4" />
          </button>
          <span className="inline-flex items-center gap-1.5">
            <button type="button" disabled className="grid size-7 place-items-center rounded-md opacity-40" aria-label={t`Add provider`}>
              <Plus className="size-4" />
            </button>
            <ComingSoon />
          </span>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  <Trans>Health check interval</Trans>
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] text-center">
                    <Trans>Background polling cadence for provider availability and auth state.</Trans>
                  </TooltipContent>
                </Tooltip>
                <ComingSoon />
              </div>
              <p className="mt-1 max-w-[520px] text-[12.5px] leading-normal text-muted-foreground">
                <Trans>Refresh provider availability, versions, auth state and model metadata in the background. Set to 0 seconds to rely on manual refreshes.</Trans>
              </p>
            </div>
            <div className="pointer-events-none flex shrink-0 items-center gap-2 opacity-50">
              <StepperInput
                value={300}
                onChange={() => {}}
                min={0}
                max={86400}
                step={30}
                disabled
                decrementLabel={t`Decrease interval`}
                incrementLabel={t`Increase interval`}
              />
              <span className="text-[13px] text-muted-foreground">
                <Trans>seconds</Trans>
              </span>
            </div>
          </div>
        </div>

        <ProviderCardGroups
          store={store}
          openId={openId}
          onToggle={(cardKey) => setOpenId((prev) => (prev === cardKey ? null : cardKey))}
          linkedCard={linkedCard}
          requestedAuth={auth}
        />
      </div>
    </TooltipProvider>
  )
}
