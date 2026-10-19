import { useLingui } from "@lingui/react/macro"
import { Move, RotateCcw } from "lucide-react"
import { StyleSection } from "adt-html-editor/shadcn"
import { usePosition } from "./PositionProvider"
import { OffsetInput } from "./OffsetInput"

export function PositionSection() {
  const { t } = useLingui()
  const position = usePosition()
  if (!position?.node) return null
  const { measured, node, active } = position
  const disabled = !measured || !!measured.reason
  return <div data-responsive-position>
    <StyleSection title={t`Position`} actions={<button type="button" title={t`Reset offsets`} aria-label={t`Reset offsets`}
      className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={disabled || (!measured?.x && !measured?.y)}
      onClick={() => position.apply("none")}><RotateCcw className="size-3.5" /></button>}>
      <div className="flex gap-2" key={node.id}>
        <OffsetInput label={t`X`} value={measured?.x ?? 0} disabled={disabled} onCommit={value => position.setAxis("x", value)} />
        <OffsetInput label={t`Y`} value={measured?.y ?? 0} disabled={disabled} onCommit={value => position.setAxis("y", value)} />
      </div>
      <button type="button" aria-pressed={active} disabled={disabled || !position.enabled}
        className={`flex h-8 items-center justify-center gap-2 rounded-md border text-xs disabled:opacity-40 ${active ? "border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200" : "hover:bg-accent"}`}
        onClick={position.toggle}><Move className="size-3.5" />{active ? t`Done transforming` : t`Free transform`}</button>
      <p className="text-[10px] leading-relaxed text-muted-foreground">{position.error || measured?.reason || (active
        ? t`Drag · arrows 1px · Shift 10px · Esc to finish`
        : !position.enabled ? t`Enable Direct controls to drag.` : t`Visual offset · keeps its space · all screen sizes`)}</p>
    </StyleSection>
  </div>
}
