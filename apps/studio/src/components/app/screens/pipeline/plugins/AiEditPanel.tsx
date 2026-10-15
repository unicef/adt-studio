import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Sparkles } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAiPanelOpen } from "@/hooks/use-ai-panel"
import { useAiEditHistory } from "@/hooks/use-pages"
import type { PageSummarySection } from "@/api/client"
import { cn } from "@/lib/utils"
import { useVariant } from "@/components/app/lab/variants"
import { HistoryTurn, Shell } from "./AiEditShell"
import { AiEditPanelWired } from "./AiEditPanelWired"

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
  context?: "storyboard" | "stage"
  sections?: PageSummarySection[]
  selectedSectionIndex?: number | null
  onSelectSection?: (sectionIndex: number) => void
  suppressed?: boolean
}

interface PanelContentProps extends AiEditPanelProps {
  open: boolean
  onCollapse: () => void
}

function PanelContent({
  label,
  pageId,
  pageLabel,
  sectionIndex = 0,
  empty,
  open,
  onCollapse,
}: PanelContentProps) {
  const { t, i18n } = useLingui()
  const history = useAiEditHistory(label, pageId ?? "", sectionIndex, {
    enabled: open && !empty && !!pageId,
  })
  const turns = history.data?.history ?? []

  if (empty) {
    return (
      <Shell
        title={<Trans>Edit with AI</Trans>}
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
      title={<Trans>Edit with AI</Trans>}
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

          {turns.map((turn) => (
            <HistoryTurn key={turn.correlationId} turn={turn} />
          ))}

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

export function AiEditPanel(props: AiEditPanelProps) {
  const { t } = useLingui()
  const [storedOpen, setOpen] = useAiPanelOpen()
  const variant = useVariant("ai")
  const open = storedOpen && !props.suppressed

  if (variant === "hidden" || (variant === "wired" && props.context !== "storyboard")) return null

  return (
    <>
      <aside
        data-chrome="ai"
        inert={!open}
        aria-hidden={!open}
        data-ai-panel={open && variant !== "mock" ? "open" : undefined}
        className={cn(
          "shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? "w-[326px] opacity-100" : "w-0 opacity-0",
        )}
      >
        {variant === "wired" ? (
          <AiEditPanelWired
            label={props.label}
            pageId={props.pageId}
            pageLabel={props.pageLabel}
            sections={props.sections}
            sectionIndex={props.selectedSectionIndex}
            onSelectSection={props.onSelectSection}
            empty={props.empty}
            open={open}
            onCollapse={() => setOpen(false)}
          />
        ) : (
          <PanelContent {...props} open={open} onCollapse={() => setOpen(false)} />
        )}
      </aside>

      <button
        type="button"
        onClick={() => setOpen(true)}
        inert={open}
        aria-hidden={open}
        title={t`Edit with AI`}
        aria-label={t`Edit with AI`}
        style={{ viewTransitionName: "step-ai-toggle" }}
        className={cn(
          "absolute bottom-5.5 right-5 z-20 grid size-11 place-items-center rounded-full bg-brand-600 text-white shadow-[0_12px_30px_-12px_rgba(0,0,0,0.55)] transition-[opacity,transform] duration-300 ease-out hover:bg-brand-700 motion-reduce:transition-none",
          open ? "pointer-events-none scale-50 opacity-0" : "scale-100 opacity-100",
        )}
      >
        <Sparkles className="size-[19px]" />
      </button>
    </>
  )
}
