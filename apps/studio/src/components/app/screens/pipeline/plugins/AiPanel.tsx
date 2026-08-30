import { useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { useAiPanelOpen } from "@/hooks/use-ai-panel"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { cn } from "@/lib/utils"
import { AiEditPanelContent, type AiEditPanelProps } from "./AiEditPanel"
import { ChatPanel } from "./chat/ChatPanel"
import type { ChatScreenContext } from "./chat/useBookChat"

const AI_PANEL_TABS = ["chat", "edit"] as const
type AiPanelTab = (typeof AI_PANEL_TABS)[number]

const tabStore = createPersistentStore<AiPanelTab>(
  "adt.ai-panel-tab",
  "chat",
  (value): value is AiPanelTab => AI_PANEL_TABS.includes(value as AiPanelTab),
)

export interface AiPanelProps extends AiEditPanelProps {
  screenContext?: ChatScreenContext
}

function TabSwitch({
  tab,
  onChange,
}: {
  tab: AiPanelTab
  onChange: (tab: AiPanelTab) => void
}) {
  const { t } = useLingui()
  const labels: Record<AiPanelTab, string> = {
    chat: t`Chat`,
    edit: t`Edit with AI`,
  }

  return (
    <div
      role="tablist"
      aria-label={t`AI panel mode`}
      className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {AI_PANEL_TABS.map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={tab === value}
          onClick={() => onChange(value)}
          className={cn(
            "rounded-[6px] px-2 py-1 text-[11.5px] font-semibold transition-[background-color,color,scale] duration-150 active:scale-[0.96] motion-reduce:transition-none",
            tab === value
              ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[value]}
        </button>
      ))}
    </div>
  )
}

/**
 * The right-hand AI rail. Hosts the book chat and the section-scoped AI edit
 * history behind one open/closed state, so only one panel occupies the rail.
 */
export function AiPanel({ screenContext, ...editProps }: AiPanelProps) {
  const { t } = useLingui()
  const [open, setOpen] = useAiPanelOpen()
  const [tab, setTab] = tabStore.use()

  const title = <TabSwitch tab={tab} onChange={setTab} />
  const collapse = () => setOpen(false)

  return (
    <>
      <aside
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? "w-[326px] opacity-100" : "w-0 opacity-0",
        )}
      >
        {tab === "chat" ? (
          <ChatPanel
            label={editProps.label}
            open={open}
            title={title}
            onCollapse={collapse}
            screenContext={screenContext ?? {}}
          />
        ) : (
          <AiEditPanelContent
            {...editProps}
            open={open}
            title={title}
            onCollapse={collapse}
          />
        )}
      </aside>

      <button
        type="button"
        onClick={() => setOpen(true)}
        inert={open}
        aria-hidden={open}
        title={t`Open the AI panel`}
        aria-label={t`Open the AI panel`}
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
