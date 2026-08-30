import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Sparkles } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAiEditHistory } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { AiPanelShell } from "./AiPanelShell"

const STARTERS: MessageDescriptor[] = [
  msg`Split the book into sections by stanza`,
  msg`Give each illustration its own section`,
  msg`One section per PDF page`,
]

const QUICK_ACTIONS: MessageDescriptor[] = [
  msg`Simplify the language`,
  msg`Check the reading order`,
]

export interface AiEditPanelProps {
  label: string
  pageId: string | null
  pageLabel?: string
  sectionIndex?: number
  empty?: boolean
}

function Composer({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border bg-card px-3 py-2.5 transition-[border-color,box-shadow] focus-within:border-brand-400 focus-within:shadow-[0_0_0_3px_var(--brand-50)]">
      <Sparkles className="size-3.5 shrink-0 text-brand-600" />
      <input
        type="text"
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

function Shell({
  title,
  meta,
  children,
  composerPlaceholder,
  onCollapse,
}: {
  title: React.ReactNode
  meta: React.ReactNode
  children: React.ReactNode
  composerPlaceholder: string
  onCollapse: () => void
}) {
  return (
    <AiPanelShell
      title={title}
      meta={meta}
      onCollapse={onCollapse}
      footer={<Composer placeholder={composerPlaceholder} />}
    >
      {children}
    </AiPanelShell>
  )
}

export interface AiEditPanelContentProps extends AiEditPanelProps {
  open: boolean
  onCollapse: () => void
  title: React.ReactNode
}

export function AiEditPanelContent({
  label,
  pageId,
  pageLabel,
  sectionIndex = 0,
  empty,
  open,
  onCollapse,
  title,
}: AiEditPanelContentProps) {
  const { t, i18n } = useLingui()
  const history = useAiEditHistory(label, pageId ?? "", sectionIndex, {
    enabled: open && !empty && !!pageId,
  })
  const turns = history.data?.history ?? []

  if (empty) {
    return (
      <Shell
        title={title}
        meta={t`no history`}
        composerPlaceholder={t`Say how to split the book…`}
        onCollapse={onCollapse}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-3.5 py-4">
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-2 py-6 text-center">
            <span className="grid size-8 place-items-center rounded-[10px] bg-brand-50 text-brand-600">
              <Sparkles className="size-4" />
            </span>
            <span className="text-[12.5px] font-semibold">
              <Trans>Nothing to edit yet</Trans>
            </span>
            <span className="text-[11.5px] leading-relaxed text-muted-foreground">
              <Trans>Once the sections exist, ask here for any change to the page HTML.</Trans>
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Trans>Start with</Trans>
            </span>
            {STARTERS.map((starter) => (
              <button
                key={starter.id ?? String(starter.message)}
                type="button"
                className="rounded-[9px] border px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                “{i18n._(starter)}”
              </button>
            ))}
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      title={title}
      meta={pageLabel ? t`history · ${pageLabel}` : ""}
      composerPlaceholder={t`Ask the AI to edit this page…`}
      onCollapse={onCollapse}
    >
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
                  <span className="text-[10px] text-muted-foreground">
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
                key={action.id ?? String(action.message)}
                type="button"
                className="rounded-full border px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                {i18n._(action)}
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </Shell>
  )
}
