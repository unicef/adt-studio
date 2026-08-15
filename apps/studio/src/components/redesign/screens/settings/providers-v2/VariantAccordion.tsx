import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { PROVIDER_CARDS, ROLE_GROUPS } from "./data"
import { CardRailStatus, EASE, ProviderTile, descriptorById, localize } from "./shared"
import { ProviderCard } from "./ProviderEditor"
import { useProvidersV2 } from "./useProvidersV2"
import { GroupHeading } from "./GroupHeading"

function CardSubtitle({ cardKey }: { cardKey: string }) {
  const { i18n } = useLingui()
  const card = PROVIDER_CARDS[cardKey]
  if (card.apiKeyProviderId && card.cliProviderId) {
    return <Trans>API key or {card.cliLabel}</Trans>
  }
  const only = descriptorById(card.apiKeyProviderId ?? card.localProviderId!)
  if (only.manifest.localizedHelp) return <>{localize(only.manifest.localizedHelp, i18n.locale)}</>
  return <>{only.manifest.docsUrl ? new URL(only.manifest.docsUrl).host : ""}</>
}

function Row({ cardKey, open, onToggle, store }: { cardKey: string; open: boolean; onToggle: () => void; store: ReturnType<typeof useProvidersV2> }) {
  const card = PROVIDER_CARDS[cardKey]
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn("flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150", EASE, open ? "bg-muted/40" : "hover:bg-muted/30")}
      >
        <ProviderTile id={card.uiId} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold leading-tight">{card.displayName}</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            <CardSubtitle cardKey={cardKey} />
          </span>
        </span>
        <CardRailStatus cardKey={cardKey} store={store} />
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", EASE, open && "rotate-180")} />
      </button>
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

export function VariantAccordion() {
  const store = useProvidersV2()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-7">
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
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
