import { useMemo } from "react"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { CaptionItem } from "./CaptionItem"
import type { CaptionEdits } from "./useCaptionEdits"
import type { CaptionFilters } from "./useCaptionFilters"
import { useSectionLabel } from "./useSectionLabel"

interface CardGroup {
  sectionIndex: number
  sectionType?: string
  items: CaptionEntry[]
}

export function CaptionCards({
  label,
  hex,
  edits,
  filters,
  locked,
  grouped = false,
  onOpen,
}: {
  label: string
  hex: string
  edits: CaptionEdits
  filters: CaptionFilters
  locked: boolean
  grouped?: boolean
  onOpen: (imageId: string) => void
}) {
  const sectionLabel = useSectionLabel()
  const { shown, sourceOf, sectionOf, sections } = filters

  const groups = useMemo<CardGroup[] | null>(() => {
    if (!grouped || sections.length <= 1) return null
    const map = new Map<number, CardGroup>()
    for (const entry of shown.items) {
      const index = sectionOf.get(entry.imageId) ?? -1
      const group = map.get(index) ?? { sectionIndex: index, sectionType: index >= 0 ? sections[index]?.sectionType : undefined, items: [] }
      group.items.push(entry)
      map.set(index, group)
    }
    const list = [...map.values()].sort((a, b) => (a.sectionIndex < 0 ? 1 : b.sectionIndex < 0 ? -1 : a.sectionIndex - b.sectionIndex))
    return list.length > 1 ? list : null
  }, [grouped, sections, shown.items, sectionOf])

  const card = (entry: CaptionEntry) => (
    <CaptionItem
      key={entry.imageId}
      label={label}
      entry={entry}
      source={sourceOf.get(entry.imageId)}
      hex={hex}
      edited={edits.editedKeys.has(entry.imageId)}
      locked={locked}
      stale={shown.stale.has(entry.imageId)}
      onCaption={edits.setCaption}
      onDecorative={edits.setDecorative}
      onOpen={onOpen}
      saveState={edits.saveStates.get(entry.imageId) ?? null}
      onUndo={edits.undo}
    />
  )

  if (!groups) return <div className="flex flex-col gap-3">{shown.items.map(card)}</div>
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.sectionIndex} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
            <span className="size-1.5 rounded-full" style={{ background: hex }} />
            {sectionLabel(group.sectionIndex, group.sectionType)}
            <span className="font-mono text-[11px] font-normal tabular-nums text-muted-foreground">{group.items.length}</span>
          </h3>
          <div className="flex flex-col gap-3">{group.items.map(card)}</div>
        </section>
      ))}
    </div>
  )
}
