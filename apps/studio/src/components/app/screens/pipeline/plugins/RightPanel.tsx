import { useEffect, useId } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { PanelRightClose, PanelRightOpen, Sparkles, UserRound } from "lucide-react"
import { focusPanelToggle, useRightPanelOpen } from "@/components/app/screens/pipeline/shared/panelFit"
import { useVariant } from "@/components/app/lab/variants"
import { cn } from "@/lib/utils"
import { useCanvasEditing } from "@/components/app/screens/pipeline/canvas/editing/CanvasEditing"
import { StyleSidePanel } from "@/components/app/screens/pipeline/canvas/editing/StyleSidePanel"
import { SegmentedTabs, tabPanelProps } from "@/components/app/screens/pipeline/shared/SegmentedTabs"
import { RIGHT_PANEL_WIDTH_CLASS } from "@/components/app/screens/pipeline/shared/panelLayout"
import { setRightPanelTab, useRightPanelTab, type RightTab } from "@/components/app/screens/pipeline/shared/rightPanelTab"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { AiEditPanel, aiPanelAvailable, type AiEditPanelProps } from "./AiEditPanel"
import { HumanEmpty } from "./HumanEmpty"

export interface RightPanelProps {
  label: string
  viewport: Viewport
  editingEnabled: boolean
  ai: AiEditPanelProps
}

function useRightPanelContent(context: AiEditPanelProps["context"]) {
  const { t } = useLingui()
  const aiVariant = useVariant("ai")
  const ai = aiPanelAvailable(aiVariant, context)
  const name = ai ? t`Agent and Human panel` : t`Human panel`
  return {
    ai,
    regionLabel: ai ? t`Agent and Human` : t`Human`,
    hideLabel: t`Hide the ${name}`,
    showLabel: t`Show the ${name}`,
  }
}

export function RightPanel({ label, viewport, editingEnabled, ai }: RightPanelProps) {
  const { t } = useLingui()
  const [open, setOpen] = useRightPanelOpen()
  const aiVariant = useVariant("ai")
  const content = useRightPanelContent(ai.context)
  const { selection } = useCanvasEditing()
  const [tab, setTab] = useRightPanelTab()
  const idBase = useId()

  useEffect(() => () => setRightPanelTab("ai"), [])


  const both = content.ai
  const active: RightTab = both ? tab : "edit"
  const bodyClassName = "min-h-0 flex-1 flex-col animate-in fade-in duration-150 motion-reduce:animate-none"

  return (
    <>
      <aside
        data-chrome="ai"
        aria-label={content.regionLabel}
        inert={!open}
        aria-hidden={!open}
        data-ai-panel={open && content.ai && aiVariant !== "mock" ? "open" : undefined}
        className={cn(
          "shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? cn(RIGHT_PANEL_WIDTH_CLASS, "opacity-100") : "w-0 opacity-0",
        )}
      >
        <div className={cn("flex h-full flex-col border-l bg-card transition-[width] duration-300 ease-out motion-reduce:transition-none", RIGHT_PANEL_WIDTH_CLASS)}>
          <div data-chrome="aihead" className="flex h-11 shrink-0 items-center gap-1.5 px-2.5">
            <button
              type="button"
              data-panel-toggle="ai-hide"
              onClick={() => {
                setOpen(false)
                focusPanelToggle("ai-show")
              }}
              title={content.hideLabel}
              aria-label={content.hideLabel}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              <PanelRightClose className="size-3.5" />
            </button>
            {both ? (
              <SegmentedTabs
                idBase={idBase}
                label={t`Right panel`}
                value={active}
                onChange={setTab}
                tabs={[
                  {
                    value: "ai",
                    label: (
                      <>
                        <Sparkles className="size-3.5" />
                        <Trans>Agent</Trans>
                      </>
                    ),
                  },
                  {
                    value: "edit",
                    label: (
                      <>
                        <UserRound className="size-3.5" />
                        <Trans>Human</Trans>
                      </>
                    ),
                  },
                ]}
              />
            ) : (
              <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                <Trans>Human</Trans>
              </h2>
            )}
          </div>

          <div {...(both ? tabPanelProps(idBase, "edit") : {})} className={cn(bodyClassName, active === "edit" ? "flex" : "hidden")}>
            {!selection && <HumanEmpty />}
            <div
              className={cn(
                "flex min-h-0 flex-1 [&>*]:w-full [&>*>div]:w-full [&>*>div]:border-l-0 [&>*>div]:bg-transparent",
                !selection && "hidden",
              )}
            >
              <StyleSidePanel label={label} viewport={viewport} open={editingEnabled} as="div" />
            </div>
          </div>

          {content.ai && (
            <div {...(both ? tabPanelProps(idBase, "ai") : {})} className={cn(bodyClassName, active === "ai" ? "flex" : "hidden")}>
              <AiEditPanel {...ai} embedded header="none" selectedSectionIndex={selection?.sectionIndex ?? null} />
            </div>
          )}
        </div>
      </aside>

      <button
        type="button"
        data-panel-toggle="ai-show"
        onClick={() => {
          setOpen(true)
          focusPanelToggle("ai-hide")
        }}
        inert={open}
        aria-hidden={open}
        title={content.showLabel}
        aria-label={content.showLabel}
        style={{ viewTransitionName: "step-ai-toggle" }}
        className={cn(
          "absolute top-6 right-6 z-20 grid size-8 place-items-center rounded-lg border bg-card/85 text-muted-foreground shadow-sm backdrop-blur-sm",
          "transition-[opacity,scale,background-color,color] ease-out hover:bg-muted hover:text-foreground motion-reduce:transition-none",
          open ? "pointer-events-none scale-90 opacity-0 duration-100" : "scale-100 opacity-100 delay-150 duration-200",
        )}
      >
        <PanelRightOpen className="size-3.5" />
      </button>
    </>
  )
}
