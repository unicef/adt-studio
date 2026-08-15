import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useProviderCards, type ProviderCard, type ProviderId } from "./providers"
import { ProviderFieldInputs, useAccentDot, useProviderDraft } from "./providerFields"
import { providerAnchor } from "./nav"

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"

function ProviderRow({
  card,
  open,
  onToggle,
}: {
  card: ProviderCard
  open: boolean
  onToggle: () => void
}) {
  const { i18n } = useLingui()
  const Icon = card.icon
  const dot = useAccentDot(card.accent)
  const draft = useProviderDraft(card, onToggle)

  return (
    <div id={providerAnchor(card.id)} className="scroll-mt-24">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150",
          EASE,
          open ? "bg-muted/40" : "hover:bg-muted/30",
        )}
      >
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", card.tile)}>
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold leading-tight">{card.name}</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {card.connected && card.summary ? (
              <span className="font-mono">{card.summary}</span>
            ) : (
              i18n._(card.desc)
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium">
          <span className={cn("size-1.5 rounded-full", card.connected ? dot : "bg-muted-foreground/40")} />
          <span className={card.connected ? "text-foreground" : "text-muted-foreground"}>
            {card.connected ? <Trans>Connected</Trans> : <Trans>Not set</Trans>}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
            EASE,
            open && "rotate-180",
          )}
        />
      </button>

      <div
        className={cn("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", EASE)}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "border-t bg-muted/20 px-4 py-4 transition-opacity duration-300 motion-reduce:transition-none",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            <ProviderFieldInputs card={card} draft={draft} onSubmit={draft.save} />
            {card.hint && <p className="mt-3 text-[11.5px] leading-normal text-muted-foreground">{i18n._(card.hint)}</p>}
            <div className="mt-4 flex items-center gap-2">
              {draft.hasStoredValue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={draft.remove}
                  className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  <Trans>Remove</Trans>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className={cn("ml-auto transition-transform duration-150 motion-safe:active:scale-[0.97]", EASE)}
                disabled={!draft.canSave}
                onClick={draft.save}
              >
                <Trans>Save</Trans>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProvidersConductor() {
  const cards = useProviderCards()
  const [openId, setOpenId] = useState<ProviderId | null>(null)

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {cards.map((card, index) => (
        <div key={card.id} className={cn(index > 0 && "border-t")}>
          <ProviderRow
            card={card}
            open={openId === card.id}
            onToggle={() => setOpenId((prev) => (prev === card.id ? null : card.id))}
          />
        </div>
      ))}
    </div>
  )
}
