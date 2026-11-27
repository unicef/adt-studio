import type { PublisherComponent, PublisherDocument, PublisherMaster, PublisherTextStyle } from "@adt/types"
import { Trans, useLingui } from "@lingui/react/macro"
import { Input } from "@/components/ui/input"

import { NumberField, ColorField } from "./StyleFields"
import { ComponentTreatment } from "./ComponentTreatment"

export function DesignInspector({ document, selectedId, onChange }: { document: PublisherDocument; selectedId: string; onChange: (document: PublisherDocument) => void }) {
  const { t } = useLingui()
  const style = document.styles.find((s) => s.id === selectedId)
  const component = document.components.find((s) => s.id === selectedId)
  const master = document.masters.find((s) => s.id === selectedId)
  const selected = style ?? component ?? master
  if (!selected) return null
  const setStyle = (patch: Partial<PublisherTextStyle>) => onChange({ ...document, styles: document.styles.map((s) => s.id === selectedId ? { ...s, ...patch } : s) })
  const setComponent = (patch: Partial<PublisherComponent>) => onChange({ ...document, components: document.components.map((s) => s.id === selectedId ? { ...s, ...patch } : s) })
  const setMaster = (patch: Partial<PublisherMaster>) => onChange({ ...document, masters: document.masters.map((s) => s.id === selectedId ? { ...s, ...patch } : s) })
  const setName = (name: string) => { if (name.trim()) { if (style) setStyle({ name }); else if (component) setComponent({ name }); else setMaster({ name }) } }
  return <div className="space-y-5 border-t p-4">
    <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Name</Trans><Input value={selected.name} maxLength={100} onChange={(e) => setName(e.target.value)} className="h-8 text-foreground" /></label>
    <code className="block break-all text-[10px] text-muted-foreground">.{selected.id}</code>
    {style && <>
      <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Font family</Trans><Input className="h-8 text-foreground" value={style.fontFamily} maxLength={160} onChange={(e) => { if (/^[\p{L}\p{N} ,.'"_-]+$/u.test(e.target.value)) setStyle({ fontFamily: e.target.value }) }} /></label>
      <p className="text-[11px] leading-relaxed text-muted-foreground"><Trans>Use an installed font or attach it in Fonts. Unavailable fonts use the browser fallback.</Trans></p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t`Size (px)`} value={style.fontSize} min={8} max={120} step={0.1} onChange={(fontSize) => setStyle({ fontSize })} />
        <NumberField label={t`Weight`} value={style.fontWeight} min={100} max={900} step={100} onChange={(fontWeight) => setStyle({ fontWeight })} />
        <NumberField label={t`Line height`} value={style.lineHeight} min={1} max={3} step={0.05} onChange={(lineHeight) => setStyle({ lineHeight })} />
        <NumberField label={t`Space after (px)`} value={style.spaceAfter} min={0} max={100} onChange={(spaceAfter) => setStyle({ spaceAfter })} />
        <NumberField label={t`Tracking (px)`} value={style.letterSpacing} min={-2} max={12} step={0.1} onChange={(letterSpacing) => setStyle({ letterSpacing })} />
        <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Alignment</Trans><select className="h-8 rounded border bg-background px-2 text-foreground" aria-label={t`Alignment`} value={style.textAlign} onChange={(e) => setStyle({ textAlign: e.target.value as PublisherTextStyle["textAlign"] })}><option value="start">{t`Start`}</option><option value="center">{t`Center`}</option><option value="end">{t`End`}</option><option value="justify">{t`Justify`}</option></select></label>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={style.fontStyle === "italic"} onChange={(e) => setStyle({ fontStyle: e.target.checked ? "italic" : "normal" })} /><Trans>Italic</Trans></label>
      {document.theme && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={style.useBookAccent ?? false} onChange={(e) => setStyle({ useBookAccent: e.target.checked })} /><Trans>Use book accent for text</Trans></label>}
      {!style.useBookAccent && <ColorField label={t`Text color`} value={style.color} onChange={(color) => setStyle({ color })} />}
    </>}
    {component && <>
      <ComponentTreatment component={component} hasBookAccent={!!document.theme} onChange={setComponent} />
      <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Component layout</Trans><select className="h-8 rounded border bg-background px-2 text-foreground" aria-label={t`Component layout`} value={component.layout} onChange={(e) => setComponent({ layout: e.target.value as PublisherComponent["layout"] })}><option value="stack">{t`Stack`}</option><option value="grid">{t`Grid`}</option><option value="callout">{t`Callout`}</option><option value="figure">{t`Figure`}</option></select></label>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t`Columns`} value={component.columns} min={1} max={3} onChange={(columns) => setComponent({ columns })} />
        <NumberField label={t`Padding (px)`} value={component.padding} min={0} max={80} onChange={(padding) => setComponent({ padding })} />
        <NumberField label={t`Gap (px)`} value={component.gap} min={0} max={80} onChange={(gap) => setComponent({ gap })} />
        <NumberField label={t`Corners (px)`} value={component.radius} min={0} max={60} onChange={(radius) => setComponent({ radius })} />
      </div>
      {component.palette !== "book" && <>
      {component.treatment !== "banner" && <>
      <ColorField label={t`Background`} value={component.background} onChange={(background) => setComponent({ background })} />
      {(!component.treatment || component.treatment === "plain") && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setComponent({ background: "transparent" })}><Trans>Transparent</Trans></button>}
      </>}
      <ColorField label={t`Accent`} value={component.accent} onChange={(accent) => setComponent({ accent })} />
      </>}
      {(/image|figure/.test(component.structure)) && <>
        <NumberField label={t`Image height (px)`} value={component.imageHeight} min={100} max={900} onChange={(imageHeight) => setComponent({ imageHeight })} />
        <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Image fit</Trans><select className="h-8 rounded border bg-background px-2 text-foreground" aria-label={t`Image fit`} value={component.imageFit} onChange={(e) => setComponent({ imageFit: e.target.value as "contain" | "cover" })}><option value="contain">{t`Show complete image`}</option><option value="cover">{t`Fill and crop`}</option></select></label>
      </>}
    </>}
    {master && <>
      <div className="grid grid-cols-2 gap-3">
        {document.pages.some((p) => p.masterId === master.id && !p.regions) && <NumberField label={t`Default columns`} value={master.columns} min={1} max={2} onChange={(columns) => setMaster({ columns })} />}
        <NumberField label={t`Page width (px)`} value={master.maxWidth} min={480} max={1600} onChange={(maxWidth) => setMaster({ maxWidth })} />
        <NumberField label={t`Margins (px)`} value={master.padding} min={16} max={120} onChange={(padding) => setMaster({ padding })} />
        <NumberField label={t`Gutter (px)`} value={master.gap} min={8} max={80} onChange={(gap) => setMaster({ gap })} />
      </div>
      <ColorField label={t`Paper color`} value={master.background} onChange={(background) => setMaster({ background })} />
      {!document.theme && <ColorField label={t`Accent`} value={master.accent} onChange={(accent) => setMaster({ accent })} />}
      <p className="text-xs leading-relaxed text-muted-foreground"><Trans>A page master shares margins, gutters, and page treatment. Each page can combine different layout regions.</Trans></p>
    </>}
    {"evidence" in selected && <div className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground"><Trans>Source evidence</Trans></p>
      <p>{t`${selected.evidence.count} matches across ${selected.evidence.pageIds.length} source pages`}</p>
      <p className="mt-1 break-words font-mono text-[10px]">{selected.evidence.pageIds.join(", ")}</p>
      {style && <p className="mt-2">{style.origin === "pdf" ? t`Font, size, weight, and color detected from PDF text runs.` : t`Designed preset; no matching PDF text run was used.`}</p>}
      {component && <p className="mt-2">{component.origin === "pdf" ? t`Image proportions and grouping detected from PDF geometry. Other treatments use the preset.` : t`Detected from content structure. The component design is a reusable preset.`}</p>}
    </div>}
  </div>
}
