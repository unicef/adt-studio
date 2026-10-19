import { useLingui } from "@lingui/react/macro"
import { Scaling } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { layoutOperations } from "./componentLayout"
import type { useBoxHeight } from "./useBoxHeight"
import type { useFlowSelection } from "./useFlowSelection"

export function BoxSizeControls({ selection, height }: { selection: ReturnType<typeof useFlowSelection>; height: ReturnType<typeof useBoxHeight> }) {
  const { t } = useLingui()
  const { geometry, node, editor, doc } = selection
  if (!geometry || !node || !height.canResize) return null
  const css = getComputedStyle(geometry.element)
  function padding(axis: "x" | "y", value: number) {
    if (!geometry || !Number.isFinite(value)) return
    const amount = Math.max(0, Math.min(160, Math.round(value)))
    editor.transaction(() => layoutOperations(editor, doc).update(geometry.element,
      axis === "y" ? /^p[tyb]-.*$/ : /^p[xlr]-.*$/,
      axis === "y" ? [`pt-[${amount}px]`, `pb-[${amount}px]`] : [`pl-[${amount}px]`, `pr-[${amount}px]`],
      axis === "y" ? ["padding-top", "padding-bottom", "padding-block"] : ["padding-left", "padding-right", "padding-inline"]))
  }
  const fields = [
    { label: t`Height`, value: Math.round(geometry.box.height), max: 1600, apply: height.apply },
    { label: t`Vertical inner space`, value: Math.round((parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)) / 2), max: 160, apply: (value: number) => padding("y", value) },
    { label: t`Horizontal inner space`, value: Math.round((parseFloat(css.paddingLeft) + parseFloat(css.paddingRight)) / 2), max: 160, apply: (value: number) => padding("x", value) },
  ]
  return <Popover>
    <PopoverTrigger asChild><button type="button" aria-label={t`Size and spacing`} title={t`Size and spacing`}
      className="flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent"><Scaling className="size-4" />{t`Size`}</button></PopoverTrigger>
    <PopoverContent className="w-72 space-y-3 p-3" align="start" onPointerDown={event => event.stopPropagation()}>
      <p className="text-xs font-semibold">{t`Size and spacing`}</p>
      {fields.map(field => <label key={field.label} className="flex items-center justify-between gap-3 text-xs">
        {field.label}<span className="flex items-center gap-1"><input key={`${node.id}-${field.value}`} type="number" min={0} max={field.max}
          aria-label={field.label} defaultValue={field.value} className="h-8 w-20 rounded border bg-background px-2"
          onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur() }}
          onBlur={event => { if (event.currentTarget.value !== "" && Number(event.currentTarget.value) !== field.value) field.apply(Number(event.currentTarget.value)) }} />{t`px`}</span>
      </label>)}
      <p className="text-[11px] text-muted-foreground">{t`Height removes spare space first. Content can grow on smaller screens. Inner space controls the padding around the contents.`}</p>
    </PopoverContent>
  </Popover>
}
