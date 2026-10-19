import { useLingui } from "@lingui/react/macro"
import { LayoutMenu } from "./LayoutMenu"
import { ComponentMoveHandle } from "./ComponentMoveHandle"
import type { useFlowSelection } from "./useFlowSelection"
import type { useArrangeGesture } from "./useArrangeGesture"
import type { useComponentLayout } from "./useComponentLayout"
import type { useElementContainer } from "./useElementContainer"

export function ArrangeControls({ selection, layout, arrange, container }: { selection: ReturnType<typeof useFlowSelection>; layout: ReturnType<typeof useComponentLayout>; arrange: ReturnType<typeof useArrangeGesture>; container: ReturnType<typeof useElementContainer> }) {
  const { t } = useLingui()
  const actions = [
    { label: t`Select whole component`, disabled: !layout.canArrange, run: layout.select },
    { label: t`Wrap in container`, disabled: !container.canWrap, run: container.request },
    { label: t`Row · align centres`, disabled: !layout.canRow, run: () => layout.row("center") },
    { label: t`Row · align tops`, disabled: !layout.canRow, run: () => layout.row("start") },
    { label: t`Row · align bottoms`, disabled: !layout.canRow, run: () => layout.row("end") },
    { label: t`Centre contents`, disabled: !layout.canCenter, run: layout.center },
    { label: t`Wrap text · object on left`, disabled: !layout.canFloat, run: () => layout.floatSide("left") },
    { label: t`Wrap text · object on right`, disabled: !layout.canFloat, run: () => layout.floatSide("right") },
    { label: t`Side by side with previous item`, disabled: !layout.pairPrevious, run: () => { if (layout.pairPrevious) layout.drop(layout.pairPrevious, "right") } },
    { label: t`Side by side with next item`, disabled: !layout.pairNext, run: () => { if (layout.pairNext) layout.drop(layout.pairNext, "left") } },
    { label: t`Side by side · equal columns`, disabled: !layout.canLayout, run: () => layout.columns(false) },
    { label: t`One below another`, disabled: !layout.canLayout, run: () => layout.columns(true) },
    { label: t`Switch order`, disabled: !layout.canSwap, run: layout.swap },
  ]
  return <>
    <ComponentMoveHandle key={selection.node?.id} selection={selection} layout={layout} arrange={arrange} />
    <LayoutMenu actions={actions} canFloat={layout.canFloat} />
  </>
}
