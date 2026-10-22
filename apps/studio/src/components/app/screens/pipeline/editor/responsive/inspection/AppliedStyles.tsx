import { useLingui } from "@lingui/react/macro"
import { useRef } from "react"
import { useDocument, useInspectorContext, useSelectedIds, type StyledNode } from "adt-html-editor"
import { StyleDetails } from "./StyleDetails"
import { StyleValues } from "./StyleValues"
import { useElementStyles } from "./useElementStyles"
import { StyleAccordion } from "./StyleAccordion"
import { TailwindClasses } from "./TailwindClasses"
import { useStyleSectionOpen } from "./useStyleSectionOpen"

export function AppliedStyles() {
  const selected = useSelectedIds(), doc = useDocument(), inspector = useInspectorContext()
  const node = selected.length === 1 ? doc.nodes[selected[0]] : undefined
  // Inspector selection is deferred by the library. Never show a class editor
  // for the old target while the immediate selection has already moved on.
  if (!node || (node.kind !== "element" && node.kind !== "opaque") || node.id === doc.rootId || node.id !== inspector.selectedId) return null
  return <SelectedStyles key={node.id} node={node} />
}

function SelectedStyles({ node }: { node: StyledNode }) {
  const { t } = useLingui()
  const host = useRef<HTMLDivElement>(null)
  const [inlineOpen, setInlineOpen] = useStyleSectionOpen("inline", true)
  const [computedOpen, setComputedOpen] = useStyleSectionOpen("computed", false)
  const { inline, computed } = useElementStyles(node, host, computedOpen)
  return <div ref={host} className="min-w-0 text-xs" data-applied-styles>
    <StyleAccordion label={t`Inline CSS`} open={inlineOpen} onOpenChange={setInlineOpen}>
      {Object.keys(inline).length ? <StyleValues values={inline} computed={computed} />
        : <p className="text-[11px] text-muted-foreground">{t`None`}</p>}
    </StyleAccordion>
    <TailwindClasses node={node} />
    <StyleAccordion label={t`Computed CSS`} open={computedOpen} onOpenChange={setComputedOpen}>
      <StyleDetails computed={computed} />
    </StyleAccordion>
  </div>
}
