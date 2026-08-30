import { Trans, useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { useAiPanelOpen } from "@/hooks/use-ai-panel"
import { cn } from "@/lib/utils"
import { ChatPanel } from "./chat/ChatPanel"
import type { ChatScreenContext } from "./chat/useBookChat"

export interface AiPanelProps {
  label: string
  screenContext?: ChatScreenContext
}

/**
 * The right-hand AI rail: a per-book assistant that can read the book and
 * propose changes, each shown for approval before it runs.
 */
export function AiPanel({ label, screenContext }: AiPanelProps) {
  const { t } = useLingui()
  const [open, setOpen] = useAiPanelOpen()

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
        <ChatPanel
          label={label}
          open={open}
          title={
            <span className="shrink-0 text-[13px] font-semibold">
              <Trans>Assistant</Trans>
            </span>
          }
          onCollapse={() => setOpen(false)}
          screenContext={screenContext ?? {}}
        />
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
