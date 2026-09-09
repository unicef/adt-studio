import { useEffect, useState } from "react"
import { useLocation } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, Loader2, Plus, RefreshCw, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { StepperInput } from "@/components/ui/stepper-input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PROVIDER_CARDS, ROLE_GROUPS } from "./data"
import { AuthLineFromHealth, EASE, HealthDotMark, ProviderTile, isCardRegistered, useCardHealth } from "./shared"
import { ComingSoon } from "../ui"
import { ProviderCard } from "./ProviderEditor"
import { useProviders } from "./useProviders"
import { GroupHeading } from "./GroupHeading"
import { providerAnchor, providerFromAnchor } from "../nav"

function Row({ cardKey, open, onToggle, store }: { cardKey: string; open: boolean; onToggle: () => void; store: ReturnType<typeof useProviders> }) {
  const card = PROVIDER_CARDS[cardKey]
  const registered = isCardRegistered(cardKey, store)
  const health = useCardHealth(cardKey, store)

  return (
    <div
      id={providerAnchor(cardKey)}
      className={cn(
        "scroll-mt-24 overflow-hidden first:rounded-t-2xl last:rounded-b-2xl",
        !registered && "opacity-75",
      )}
    >
      <div className={cn("flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-150", EASE, open && "bg-muted/40")}>
        <div className="relative shrink-0">
          <ProviderTile id={card.uiId} className="size-9" />
          <span className="absolute -left-0.5 -top-0.5">
            {registered ? <HealthDotMark {...health} /> : <span className="size-2.5 rounded-full bg-amber-400/70 ring-2 ring-card" />}
          </span>
        </div>

        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`prov-panel-${cardKey}`} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold leading-tight">{card.displayName}</span>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
            {registered ? <AuthLineFromHealth {...health} /> : <Trans>Not available on this server</Trans>}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-hidden
          tabIndex={-1}
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-300", EASE, open && "rotate-180")} />
        </button>
      </div>

      <div
        id={`prov-panel-${cardKey}`}
        role="region"
        className={cn("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", EASE)}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className={cn("border-t bg-muted/20 px-4 py-4 transition-opacity duration-300 motion-reduce:transition-none", open ? "opacity-100" : "opacity-0")}>
            <ProviderCard cardKey={cardKey} store={store} active={open} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProvidersList() {
  const { t } = useLingui()
  const store = useProviders()
  const queryClient = useQueryClient()
  const { hash } = useLocation()
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const cardKey = hash ? providerFromAnchor(hash) : null
    if (cardKey && PROVIDER_CARDS[cardKey]) setOpenId(cardKey)
  }, [hash])

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

        {store.isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card py-12 text-[12.5px] text-muted-foreground shadow-sm">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            <Trans>Loading providers…</Trans>
          </div>
        ) : store.isError ? (
          <p role="alert" className="rounded-2xl border bg-card px-5 py-4 text-[12.5px] text-destructive shadow-sm">
            <Trans>Unable to load the provider list. Check that the local API is running, then refresh.</Trans>
          </p>
        ) : (
          ROLE_GROUPS.map((group) => (
            <section key={group.key}>
              <GroupHeading label={group.label} hint={group.hint} />
              <div className="divide-y rounded-2xl border bg-card shadow-sm">
                {group.cards.map((cardKey) => (
                  <Row
                    key={cardKey}
                    cardKey={cardKey}
                    open={openId === cardKey}
                    onToggle={() => setOpenId((prev) => (prev === cardKey ? null : cardKey))}
                    store={store}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </TooltipProvider>
  )
}
