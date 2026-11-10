import { Trans } from "@lingui/react/macro"
import { ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { PROVIDER_CARDS, ROLE_GROUPS } from "./data"
import { AuthLineFromHealth, EASE, HealthDotMark, ProviderTile, isCardRegistered, useCardHealth } from "./shared"
import { ProviderCard } from "./ProviderEditor"
import type { Providers } from "./useProviders"
import { GroupHeading } from "./GroupHeading"
import { providerAnchor, type ProvidersSearch } from "../nav"

function Row({ cardKey, open, onToggle, store, requestedAuth }: { cardKey: string; open: boolean; onToggle: () => void; store: Providers; requestedAuth?: ProvidersSearch["auth"] }) {
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
            <ProviderCard cardKey={cardKey} store={store} active={open} requestedAuth={requestedAuth} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The provider cards grouped by role (models & reasoning, speech & voices),
 * with the loading and error states. Shared by Settings → AI providers and
 * the book's API keys screen, so both edit credentials the same way.
 */
export function ProviderCardGroups({
  store,
  openId,
  onToggle,
  linkedCard,
  requestedAuth,
}: {
  store: Providers
  openId: string | null
  onToggle: (cardKey: string) => void
  /** The card a "connect provider" link pointed at, which opens on `requestedAuth`. */
  linkedCard?: string | null
  requestedAuth?: ProvidersSearch["auth"]
}) {
  return (
    <>
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
                  onToggle={() => onToggle(cardKey)}
                  store={store}
                  requestedAuth={cardKey === linkedCard ? requestedAuth : undefined}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  )
}
