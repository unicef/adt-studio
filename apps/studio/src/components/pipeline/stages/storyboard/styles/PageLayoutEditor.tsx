import { useState } from "react"
import type { ContentNodeData, PublisherPage, PublisherRegion } from "@adt/types"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { NumberField } from "./StyleFields"

const columnCount = (template: PublisherRegion["template"]) => template === "full-width" ? 1 : template === "three-column" ? 3 : 2
const nodeText = (node: ContentNodeData): string => node.text ?? (node.children ?? []).filter((n) => !n.isPruned).map(nodeText).join(" ")
const nodeIds = (region: PublisherRegion) => region.slots.flatMap((slot) => slot.nodeIds)
const asFullWidth = (region: PublisherRegion, ids: string[]): PublisherRegion => ({ ...region, template: "full-width", flow: "columns", origin: "manual", slots: [{ column: 0, nodeIds: ids }] })

export function PageLayoutEditor({ page, frozen, onChange }: { page: PublisherPage; frozen: boolean; onChange: (regions: PublisherRegion[]) => void }) {
  const { t } = useLingui()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const regions = page.regions ?? []
  const selected = regions.find((r) => r.id === selectedId)
  const names = {
    "full-width": t`Full width`, "two-column": t`Two columns`, "three-column": t`Three columns`,
    "sidebar-left": t`Left sidebar`, "sidebar-right": t`Right sidebar`,
  }
  const origins = { pdf: t`PDF geometry`, semantic: t`Content structure`, manual: t`Publisher override` }
  const description = (id: string) => {
    const node = page.nodes.find((n) => n.nodeId === id)
    if (!node) return id
    return nodeText(node).slice(0, 90) || (node.role === "image" ? t`Image` : id)
  }
  const update = (next: PublisherRegion) => onChange(regions.map((r) => r.id === next.id ? { ...next, origin: "manual" } : r))
  const changeTemplate = (region: PublisherRegion, template: PublisherRegion["template"]) => {
    const ids = nodeIds(region)
    const count = columnCount(template)
    const slots = count === region.slots.length ? region.slots : Array.from({ length: count }, (_, column) => ({
      column, nodeIds: ids.slice(Math.floor(column * ids.length / count), Math.floor((column + 1) * ids.length / count)),
    }))
    update({ ...region, template, slots, flow: "columns" })
  }
  const split = (region: PublisherRegion, before: number) => {
    const ids = nodeIds(region)
    const first = asFullWidth(region, ids.slice(0, before))
    const second = asFullWidth({ ...region, id: `pub-region-${crypto.randomUUID()}` }, ids.slice(before))
    onChange(regions.flatMap((r) => r.id === region.id ? [first, second] : [r]))
    setSelectedId(second.id)
  }
  const merge = (region: PublisherRegion) => {
    const index = regions.findIndex((r) => r.id === region.id)
    const next = regions[index + 1]
    if (!next) return
    onChange(regions.flatMap((r) => r.id === next.id ? [] : r.id === region.id ? [asFullWidth(r, [...nodeIds(r), ...nodeIds(next)])] : [r]))
  }
  return <section className="rounded-xl border bg-background p-4" aria-label={t`Page regions`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-sm font-semibold"><Trans>Page regions</Trans></h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground"><Trans>One page, several layouts. Each region uses the same shared styles and master margins.</Trans></p></div>
      {!!regions.length && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-800">{t`${regions.length} regions`}</span>}
    </div>
    {!regions.length ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><Trans>This saved design uses a single page grid. Choose Detect mixed layouts above to add regions while keeping your styles.</Trans></p> : <>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{regions.map((region, index) => <button type="button" key={region.id} aria-label={t`Edit region ${index + 1}: ${names[region.template]}`} aria-pressed={selectedId === region.id} onClick={() => setSelectedId(selectedId === region.id ? null : region.id)} className={`w-36 shrink-0 rounded-lg border p-2 text-left ${selectedId === region.id ? "border-emerald-600 bg-emerald-50" : "hover:bg-muted/40"}`}>
        <div aria-hidden="true" className={`mb-2 grid h-9 gap-1 ${region.template === "three-column" ? "grid-cols-3" : region.template === "sidebar-left" ? "grid-cols-[1fr_2fr]" : region.template === "sidebar-right" ? "grid-cols-[2fr_1fr]" : region.template === "two-column" ? "grid-cols-2" : "grid-cols-1"}`}>
          {[...region.slots].sort((a, b) => a.column - b.column).map((slot) => <div key={slot.column} className="flex flex-col gap-1 rounded bg-emerald-100/60 p-1">{slot.nodeIds.slice(0, 3).map((id) => <div key={id} className="min-h-1 flex-1 rounded-sm bg-emerald-600/25" />)}</div>)}
        </div>
        <p className="text-[11px] font-medium">{index + 1}. {names[region.template]}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{t`${nodeIds(region).length} content groups`}</p>
      </button>)}</div>
      {selected && <div className="mt-3 space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium"><Trans>Region layout</Trans><select aria-label={t`Region layout`} disabled={frozen} className="h-8 rounded border bg-background px-2 font-normal" value={selected.template} onChange={(e) => changeTemplate(selected, e.target.value as PublisherRegion["template"])}>{(Object.keys(names) as PublisherRegion["template"][]).map((key) => <option key={key} value={key} disabled={nodeIds(selected).length < columnCount(key)}>{names[key]}</option>)}</select></label>
          <span className="text-[10px] text-muted-foreground">{origins[selected.origin]}</span>
          {!frozen && <>
            <select aria-label={t`Split region before`} className="ml-auto h-8 max-w-56 rounded border bg-background px-2 text-xs" value="" disabled={nodeIds(selected).length < 2} onChange={(e) => split(selected, Number(e.target.value))}><option value="">{t`Split region before…`}</option>{nodeIds(selected).slice(1).map((id, i) => <option key={id} value={i + 1}>{description(id)}</option>)}</select>
            <Button size="sm" variant="outline" disabled={regions.at(-1)?.id === selected.id} onClick={() => merge(selected)}><Trans>Merge with next</Trans></Button>
          </>}
        </div>
        {selected.template.startsWith("sidebar-") && <div className="space-y-3">
          <fieldset disabled={frozen} className="max-w-48"><NumberField label={t`Sidebar width (%)`} value={selected.sidebarWidth ?? 33} min={25} max={50} onChange={(sidebarWidth) => update({ ...selected, sidebarWidth })} /></fieldset>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={frozen || selected.slots[0].column !== (selected.template === "sidebar-left" ? 0 : 1)} checked={selected.flow === "wrap"} onChange={(e) => update({ ...selected, flow: e.target.checked ? "wrap" : "columns" })} /><Trans>Wrap text around sidebar</Trans></label>
          <p className="text-[11px] text-muted-foreground"><Trans>Wrapping is available when the sidebar comes first in reading order. Other regions keep accessible columns. Mobile stacks both.</Trans></p>
        </div>}
        <div className="grid gap-3 md:grid-cols-3">{selected.slots.map((slot, index) => {
          const ids = nodeIds(selected)
          const start = selected.slots.slice(0, index).reduce((count, s) => count + s.nodeIds.length, 0)
          const previousStart = start - (selected.slots[index - 1]?.nodeIds.length ?? 0)
          const end = start + slot.nodeIds.length
          return <div key={slot.column} className="rounded-lg bg-muted/40 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t`Column ${slot.column + 1}`}</p>
            {index > 0 && !frozen && <label className="mb-2 grid gap-1 text-[10px] text-muted-foreground"><Trans>Starts with</Trans><select aria-label={t`Start column ${slot.column + 1} with`} className="h-8 w-full min-w-0 rounded border bg-background px-1 text-xs text-foreground" value={start} onChange={(e) => {
              const boundary = Number(e.target.value)
              update({ ...selected, slots: selected.slots.map((s, i) => i === index - 1 ? { ...s, nodeIds: ids.slice(previousStart, boundary) } : i === index ? { ...s, nodeIds: ids.slice(boundary, end) } : s) })
            }}>{ids.slice(previousStart + 1, end).map((id, i) => <option key={id} value={previousStart + 1 + i}>{description(id)}</option>)}</select></label>}
            <ol className="space-y-2">{slot.nodeIds.map((id) => <li key={id} className="text-xs leading-relaxed"><p className="line-clamp-2">{description(id)}</p><code className="text-[9px] text-muted-foreground">{id}</code></li>)}</ol>
          </div>
        })}</div>
        <p className="text-[10px] text-muted-foreground"><Trans>Groups stay intact and reading order is preserved. On mobile, columns stack in reading order.</Trans></p>
      </div>}
    </>}
  </section>
}
