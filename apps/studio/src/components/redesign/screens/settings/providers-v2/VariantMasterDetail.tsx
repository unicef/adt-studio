import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { PROVIDER_CARDS, ROLE_GROUPS } from "./data"
import { CardRailStatus, EASE, ProviderTile, descriptorById, localize, requiredFieldsFilled } from "./shared"
import { ProviderCard } from "./ProviderEditor"
import { useProvidersV2 } from "./useProvidersV2"

function firstSelection(store: ReturnType<typeof useProvidersV2>): string {
  const allCards = ROLE_GROUPS.flatMap((g) => g.cards)
  const configured = allCards.find((key) => {
    const card = PROVIDER_CARDS[key]
    const id = card.apiKeyProviderId ?? card.localProviderId
    return id ? requiredFieldsFilled(descriptorById(id), store.credentials[id] ?? {}) && Object.keys(store.credentials[id] ?? {}).length > 0 : false
  })
  return configured ?? allCards[0]
}

function DetailHeaderSubtitle({ cardKey }: { cardKey: string }) {
  const { i18n } = useLingui()
  const card = PROVIDER_CARDS[cardKey]
  if (card.apiKeyProviderId && card.cliProviderId) return <Trans>API key or {card.cliLabel}</Trans>
  const only = descriptorById(card.apiKeyProviderId ?? card.localProviderId!)
  if (only.manifest.localizedHelp) return <>{localize(only.manifest.localizedHelp, i18n.locale)}</>
  return <>{only.manifest.docsUrl ? new URL(only.manifest.docsUrl).host : ""}</>
}

export function VariantMasterDetail() {
  const store = useProvidersV2()
  const [selected, setSelected] = useState<string>(() => firstSelection(store))
  const activeCard = PROVIDER_CARDS[selected]

  return (
    <div className="grid min-h-[520px] grid-cols-[268px_1fr] gap-4">
      <div className="flex flex-col gap-5 overflow-auto rounded-2xl border bg-card p-2.5 shadow-sm">
        {ROLE_GROUPS.map((group) => (
          <div key={group.key}>
            <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{group.label}</div>
            <div className="flex flex-col gap-0.5">
              {group.cards.map((cardKey) => {
                const card = PROVIDER_CARDS[cardKey]
                const isActive = selected === cardKey
                return (
                  <button
                    key={cardKey}
                    type="button"
                    onClick={() => setSelected(cardKey)}
                    className={cn("flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150", EASE, isActive ? "bg-muted" : "hover:bg-muted/50")}
                  >
                    <ProviderTile id={card.uiId} className="size-7" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{card.displayName}</span>
                    <CardRailStatus cardKey={cardKey} store={store} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div key={selected} className={cn("transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none", EASE)}>
          <div className="mb-5 flex items-center gap-3.5">
            <ProviderTile id={activeCard.uiId} className="size-12" />
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold tracking-[-0.01em]">{activeCard.displayName}</h2>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                <DetailHeaderSubtitle cardKey={selected} />
              </p>
            </div>
          </div>
          <ProviderCard cardKey={selected} store={store} active />
        </div>
      </div>
    </div>
  )
}
