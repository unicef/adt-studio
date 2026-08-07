import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Minus, ShieldCheck, Pencil, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { HEADING, LEAD } from "./ui"
import { useProviderCards, type ProviderId } from "./providers"
import { ProviderKeyDialog } from "./ProviderKeyDialog"
import { providerAnchor } from "./nav"

export function ProvidersSection() {
  const { i18n } = useLingui()
  const cards = useProviderCards()
  const [editing, setEditing] = useState<ProviderId | null>(null)

  return (
    <>
      <div className={HEADING}>
        <Trans>AI providers</Trans>
      </div>
      <div className={LEAD}>
        <Trans>API keys for the AI pipeline. Keys are stored locally on this machine and never leave it except to call the provider.</Trans>
      </div>
      <div className="flex flex-col gap-2.5">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.id}
              id={providerAnchor(card.id)}
              type="button"
              onClick={() => setEditing(card.id)}
              className="flex scroll-mt-24 items-center gap-3.5 rounded-xl border bg-card px-[18px] py-[15px] text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-accent/40"
            >
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-[11px]", card.tile)}>
                <Icon className="size-[19px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{card.name}</span>
                  <Badge variant={card.connected ? "success" : "secondary"} className="gap-1 px-2 text-[10.5px]">
                    {card.connected ? <Check className="size-3" /> : <Minus className="size-3" />}
                    {card.connected ? <Trans>Connected</Trans> : <Trans>Not set</Trans>}
                  </Badge>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{i18n._(card.desc)}</span>
              </span>
              {card.summary && (
                <span className="max-w-[220px] truncate font-mono text-[12.5px] text-muted-foreground">{card.summary}</span>
              )}
              <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium">
                {card.connected ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                {card.connected ? <Trans>Update</Trans> : <Trans>Add key</Trans>}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3.5 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-600" />
        <Trans>Keys are kept in this machine's local storage. Custom uses any OpenAI-compatible endpoint; Azure powers Speech TTS.</Trans>
      </div>
      <ProviderKeyDialog
        card={cards.find((card) => card.id === editing) ?? null}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
