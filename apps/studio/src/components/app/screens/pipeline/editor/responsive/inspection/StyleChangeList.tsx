import { useComputedStyles } from "adt-html-editor"
import type { styleEntry } from "./styleChanges"
import { StyleValues } from "./StyleValues"

export function StyleChangeList({ entries }: { entries: ReturnType<typeof styleEntry>[] }) {
  const visible = entries.filter(entry => entry.rows.length).slice(0, 2)
  return <div className="space-y-2">
    {visible.map((entry, index) => <StyleChange key={`${entry.id}-${index}`} entry={entry} showTarget={visible.length > 1} />)}
  </div>
}

function StyleChange({ entry, showTarget }: { entry: ReturnType<typeof styleEntry>; showTarget: boolean }) {
  const computed = useComputedStyles(entry.id, entry.rows.map(row => row.property))
  return <div className="min-w-0">
    {showTarget && <p className="mb-1 truncate text-[10px] text-muted-foreground">{entry.label}</p>}
    <StyleValues values={Object.fromEntries(entry.rows.slice(0, 4).map(row => [row.property, row.after || "—"]))} computed={computed ?? {}} />
  </div>
}
