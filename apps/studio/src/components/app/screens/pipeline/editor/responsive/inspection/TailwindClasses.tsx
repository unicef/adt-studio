import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { StyledNode } from "adt-html-editor"
import { InspectorClassInput, InspectorClassList } from "adt-html-editor/shadcn"
import { StyleAccordion } from "./StyleAccordion"
import { useStyleSectionOpen } from "./useStyleSectionOpen"

export function TailwindClasses({ node }: { node: StyledNode }) {
  const { t } = useLingui()
  const [open, setOpen] = useStyleSectionOpen("tailwind", true)
  const [editing, setEditing] = useState(false)
  const duplicateCount = node.classes.length - new Set(node.classes).size
  return <StyleAccordion label={t`Tailwind Classes`} open={open} onOpenChange={value => { setOpen(value); if (!value) setEditing(false) }}
    action={<button type="button" className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={editing ? t`Finish editing classes` : t`Edit Tailwind classes`}
      onClick={() => { setOpen(true); setEditing(!editing) }}>{editing ? t`Done` : t`Edit`}</button>}>
    {editing ? <div className="space-y-2">
      <InspectorClassInput />
      {/* Old documents can contain duplicate classes. Rebuild only the list when
          that count changes, preventing ghost rows without closing the editor. */}
      <InspectorClassList key={duplicateCount} />
    </div> : node.classes.length ? <div className="flex flex-wrap gap-1">
      {node.classes.map((className, index) => <code key={`${index}-${className}`} className="max-w-full break-all rounded bg-muted/60 px-1.5 py-0.5 text-[10px]">{className}</code>)}
    </div> : <p className="text-[11px] text-muted-foreground">{t`None`}</p>}
  </StyleAccordion>
}
