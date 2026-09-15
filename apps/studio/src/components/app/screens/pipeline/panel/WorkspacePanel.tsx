import { useLingui } from "@lingui/react/macro"
import { PanelRightOpen } from "lucide-react"
import { useAiPanelOpen } from "@/hooks/use-ai-panel"
import { cn } from "@/lib/utils"
import { AiComposer } from "@/components/app/screens/pipeline/plugins/ai/AiComposer"
import { AiPanelBody } from "@/components/app/screens/pipeline/plugins/ai/AiPanelBody"
import { usePanelTab } from "@/components/app/screens/pipeline/shared/workspacePrefs"
import { PanelTabs } from "./PanelTabs"
import { StylesPanel } from "./StylesPanel"

export interface WorkspacePanelProps {
  label: string
  pageId: string | null
  sectionIndex: number
  empty: boolean
  editable: boolean
}

export function WorkspacePanel({
  label,
  pageId,
  sectionIndex,
  empty,
  editable,
}: WorkspacePanelProps) {
  const { t } = useLingui()
  const [open, setOpen] = useAiPanelOpen()
  const [tab, setTab] = usePanelTab()
  const active = editable ? tab : "ai"

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
          <PanelTabs
            value={active}
            onChange={setTab}
            onCollapse={() => setOpen(false)}
            stylesDisabled={!editable}
          />

          {active === "styles" ? (
            <StylesPanel editable={editable} />
          ) : (
            <>
              <AiPanelBody
                label={label}
                pageId={pageId}
                sectionIndex={sectionIndex}
                empty={empty}
                enabled={open}
              />
              <AiComposer
                placeholder={empty ? t`Say how to split the book…` : t`Ask the AI to edit this page…`}
              />
            </>
          )}
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setOpen(true)}
        inert={open}
        aria-hidden={open}
        title={t`Show the panel`}
        aria-label={t`Show the panel`}
        className={cn(
          "absolute bottom-5.5 right-5 z-20 grid size-10 place-items-center rounded-full border bg-card text-foreground shadow-[0_12px_30px_-12px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-300 ease-out hover:bg-muted motion-reduce:transition-none",
          open ? "pointer-events-none scale-50 opacity-0" : "scale-100 opacity-100",
        )}
      >
        <PanelRightOpen className="size-[18px]" />
      </button>
    </>
  )
}
