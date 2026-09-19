import { Trans, useLingui } from "@lingui/react/macro"
import { PanelRightClose, Sparkles } from "lucide-react"
import { useAiPanelOpen } from "@/hooks/use-ai-panel"
import { cn } from "@/lib/utils"
import { AiComposer } from "./AiComposer"
import { AiPanelBody } from "./AiPanelBody"

export interface AiEditPanelProps {
  label: string
  pageId: string | null
  pageLabel?: string
  sectionIndex?: number
  empty?: boolean
}

export function AiEditPanel({
  label,
  pageId,
  pageLabel,
  sectionIndex = 0,
  empty,
}: AiEditPanelProps) {
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
        <div className="flex h-full w-[326px] flex-col border-l bg-card">
          <div className="flex items-center gap-2 border-b px-3.5 py-3">
            <span className="text-[13px] font-semibold">
              <Trans>Edit with AI</Trans>
            </span>
            <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
              {empty ? t`no history` : pageLabel ? t`history · ${pageLabel}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title={t`Hide the AI panel`}
              aria-label={t`Hide the AI panel`}
              className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelRightClose className="size-3.5" />
            </button>
          </div>

          <AiPanelBody
            label={label}
            pageId={pageId}
            sectionIndex={sectionIndex}
            empty={empty}
          />

          <AiComposer
            placeholder={empty ? t`Say how to split the book…` : t`Ask the AI to edit this page…`}
          />
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setOpen(true)}
        inert={open}
        aria-hidden={open}
        title={t`Edit with AI`}
        aria-label={t`Edit with AI`}
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
