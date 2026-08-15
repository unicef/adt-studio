import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Minus, ExternalLink, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useProviderCards, type ProviderCard } from "./providers"
import { ProviderFieldInputs, useAccentDot, useProviderDraft } from "./providerFields"
import { providerAnchor } from "./nav"

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"

function ProviderCardT3({ card }: { card: ProviderCard }) {
  const { i18n } = useLingui()
  const Icon = card.icon
  const dot = useAccentDot(card.accent)
  const draft = useProviderDraft(card, () => {})

  return (
    <article
      id={providerAnchor(card.id)}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm transition-shadow duration-300 hover:shadow-md motion-reduce:transition-none",
        EASE,
      )}
    >
      <div className="flex items-start gap-3.5">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", card.tile)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate text-[15px] font-semibold leading-tight">{card.name}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                card.connected
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {card.connected ? <Check className="size-3" /> : <Minus className="size-3" />}
              {card.connected ? <Trans>Connected</Trans> : <Trans>Not set</Trans>}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-normal text-muted-foreground">{i18n._(card.desc)}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {card.models.map((model) => (
              <span
                key={model}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                <span className={cn("size-1.5 rounded-full", dot)} />
                {model}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ProviderFieldInputs card={card} draft={draft} onSubmit={draft.save} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        {card.docsUrl && (
          <a
            href={card.docsUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-1 text-[12px] font-medium text-brand-700 transition-colors duration-150 hover:text-brand-800 hover:underline underline-offset-4",
              EASE,
            )}
          >
            <ExternalLink className="size-3.5" />
            <Trans>Get API key</Trans>
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          {draft.hasStoredValue && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={draft.remove}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              <Trans>Remove</Trans>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className={cn("transition-transform duration-150 motion-safe:active:scale-[0.97]", EASE)}
            disabled={!draft.canSave}
            onClick={draft.save}
          >
            {card.connected ? <Trans>Update key</Trans> : <Trans>Save key</Trans>}
          </Button>
        </div>
      </div>
    </article>
  )
}

export function ProvidersT3() {
  const cards = useProviderCards()
  return (
    <div className="flex flex-col gap-3">
      {cards.map((card) => (
        <ProviderCardT3 key={card.id} card={card} />
      ))}
    </div>
  )
}
