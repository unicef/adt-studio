import { Trans, useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAiEditHistory } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { QUICK_ACTIONS, STARTERS, promptKey } from "./prompts"

export interface AiPanelBodyProps {
  label: string
  pageId: string | null
  sectionIndex?: number
  empty?: boolean
}

function StarterList() {
  const { i18n } = useLingui()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-3.5 py-4">
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-2 py-6 text-center">
        <span className="grid size-8 place-items-center rounded-[10px] bg-brand-50 text-brand-600">
          <Sparkles className="size-4" />
        </span>
        <span className="text-[12.5px] font-semibold">
          <Trans>Nothing to edit yet</Trans>
        </span>
        <span className="text-[11.5px] leading-relaxed text-muted-foreground text-pretty">
          <Trans>Once the sections exist, ask here for any change to the page HTML.</Trans>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Trans>Start with</Trans>
        </span>
        {STARTERS.map((starter) => (
          <button
            key={promptKey(starter)}
            type="button"
            className="rounded-[9px] border px-3 py-2 text-left text-xs text-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out hover:border-brand-300 hover:bg-brand-50 active:scale-[0.96] motion-reduce:transition-none"
          >
            “{i18n._(starter)}”
          </button>
        ))}
      </div>
    </div>
  )
}

export function AiPanelBody({
  label,
  pageId,
  sectionIndex = 0,
  empty,
}: AiPanelBodyProps) {
  const { t, i18n } = useLingui()
  const history = useAiEditHistory(label, pageId ?? "", sectionIndex, {
    enabled: !empty && !!pageId,
  })
  const turns = history.data?.history ?? []

  if (empty) return <StarterList />

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-3 p-3.5">
        {turns.length === 0 && (
          <p className="py-6 text-center text-[11.5px] leading-relaxed text-muted-foreground">
            <Trans>No AI edits on this page yet.</Trans>
          </p>
        )}

        {turns.map((turn) => {
          const applied = turn.verify?.applied ?? true
          return (
            <div key={turn.correlationId} className="flex flex-col gap-2.5">
              <div className="flex flex-col items-end gap-1.5">
                <div className="max-w-[250px] rounded-[11px] rounded-br-[3px] border border-brand-200 bg-brand-50 px-3 py-2 text-[12.5px] leading-relaxed text-brand-900">
                  {turn.instruction}
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {new Date(turn.timestamp).toLocaleTimeString(i18n.locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="max-w-[260px] rounded-[11px] rounded-bl-[3px] border bg-muted px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
                  {turn.attempts.at(-1)?.reasoning ?? turn.verify?.reason ?? t`No reasoning recorded.`}
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-[10px]",
                      applied ? "bg-muted text-muted-foreground" : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {applied ? t`applied` : t`not applied`}
                  </span>
                  <button type="button" className="text-[10px] font-semibold text-brand-700 hover:underline">
                    <Trans>View diff</Trans>
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        <div className="mt-1 flex flex-wrap gap-1.5 border-t border-dashed pt-2.5">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={promptKey(action)}
              type="button"
              className="rounded-full border px-2.5 py-1 text-[11px] text-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out hover:border-brand-300 hover:bg-brand-50 active:scale-[0.96] motion-reduce:transition-none"
            >
              {i18n._(action)}
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
