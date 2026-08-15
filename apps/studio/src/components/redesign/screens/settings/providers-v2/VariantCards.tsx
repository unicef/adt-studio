import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { PROVIDER_CARDS, ROLE_GROUPS } from "./data"
import { EASE, ProviderTile } from "./shared"
import { ProviderCard } from "./ProviderEditor"
import { useProvidersV2 } from "./useProvidersV2"
import { GroupHeading } from "./GroupHeading"

export function VariantCards() {
  const store = useProvidersV2()

  return (
    <div className="flex flex-col gap-7">
      {ROLE_GROUPS.map((group) => (
        <section key={group.key}>
          <GroupHeading label={group.label} hint={group.hint} />
          <div className="grid items-start gap-3 md:grid-cols-2">
            {group.cards.map((cardKey) => {
              const card = PROVIDER_CARDS[cardKey]
              const isSpeech = group.key === "speech"
              return (
                <article
                  key={cardKey}
                  className={cn(
                    "rounded-2xl border bg-card p-5 shadow-sm transition-shadow duration-300 hover:shadow-md motion-reduce:transition-none",
                    EASE,
                  )}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <ProviderTile id={card.uiId} className="size-10" />
                    <div className="min-w-0">
                      <h3 className="truncate text-[14.5px] font-semibold leading-tight">{card.displayName}</h3>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {isSpeech ? <Trans>Speech / voices</Trans> : <Trans>Text &amp; reasoning</Trans>}
                      </p>
                    </div>
                  </div>
                  <ProviderCard cardKey={cardKey} store={store} active />
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
