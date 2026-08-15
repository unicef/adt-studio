import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, Plus, RefreshCw, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { StepperInput } from "@/components/ui/stepper-input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PROVIDER_CARDS, ROLE_GROUPS } from "./data"
import { AuthLineFromHealth, EASE, HealthDotMark, ProviderTile, SoonPin, useCardHealth } from "./shared"
import { ProviderCard } from "./ProviderEditor"
import { useProvidersV2 } from "./useProvidersV2"
import { GroupHeading } from "./GroupHeading"

function Row({ cardKey, open, onToggle, store, refreshToken }: { cardKey: string; open: boolean; onToggle: () => void; store: ReturnType<typeof useProvidersV2>; refreshToken: number }) {
  const { t } = useLingui()
  const card = PROVIDER_CARDS[cardKey]
  const health = useCardHealth(cardKey, store, refreshToken)

  return (
    <div>
      <div className={cn("flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-150", EASE, open && "bg-muted/40")}>
        <div className="relative shrink-0">
          <ProviderTile id={card.uiId} className="size-9" />
          <span className="absolute -left-0.5 -top-0.5">
            <HealthDotMark {...health} />
          </span>
        </div>

        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold leading-tight">{card.displayName}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* eslint-disable-next-line lingui/no-unlocalized-strings -- pinned version placeholder glyph, not UI copy */}
                <span className="font-mono text-[11px] text-muted-foreground/40">v—</span>
              </TooltipTrigger>
              <TooltipContent>
                <Trans>Provider version — available after the backend merge.</Trans>
              </TooltipContent>
            </Tooltip>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
            <AuthLineFromHealth {...health} />
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

        <span className="inline-flex items-center gap-1.5">
          <Switch checked disabled aria-label={t`Enable provider`} className="opacity-70" />
          <SoonPin />
        </span>
      </div>

      <div className={cn("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", EASE)} style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className={cn("border-t bg-muted/20 px-4 py-4 transition-opacity duration-300 motion-reduce:transition-none", open ? "opacity-100" : "opacity-0")}>
            <ProviderCard cardKey={cardKey} store={store} active={open} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function VariantT3List() {
  const { t } = useLingui()
  const store = useProvidersV2()
  const [openId, setOpenId] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [checked, setChecked] = useState(false)

  const refresh = () => {
    setRefreshToken((n) => n + 1)
    setChecked(true)
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-end gap-2 text-muted-foreground">
          <span className="text-[12px]">{checked ? <Trans>Checked just now</Trans> : <Trans>Not checked yet</Trans>}</span>
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
            <SoonPin />
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
                <SoonPin />
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

        {ROLE_GROUPS.map((group) => (
          <section key={group.key}>
            <GroupHeading label={group.label} hint={group.hint} />
            <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
              {group.cards.map((cardKey) => (
                <Row
                  key={cardKey}
                  cardKey={cardKey}
                  open={openId === cardKey}
                  onToggle={() => setOpenId((prev) => (prev === cardKey ? null : cardKey))}
                  store={store}
                  refreshToken={refreshToken}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </TooltipProvider>
  )
}
