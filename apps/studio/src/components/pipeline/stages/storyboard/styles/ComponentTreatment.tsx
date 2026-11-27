import type { PublisherComponent } from "@adt/types"
import { Trans, useLingui } from "@lingui/react/macro"
import { NumberField } from "./StyleFields"

export function ComponentTreatment({ component, hasBookAccent, onChange }: { component: PublisherComponent; hasBookAccent: boolean; onChange: (patch: Partial<PublisherComponent>) => void }) {
  const { t } = useLingui()
  return <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
    <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Box treatment</Trans>
      <select className="h-9 rounded border bg-background px-2 text-foreground" value={component.treatment ?? "plain"} onChange={(e) => onChange({ treatment: e.target.value as PublisherComponent["treatment"], ...(e.target.value !== "plain" && component.background === "transparent" ? { background: "#ffffff" } : {}) })}>
        <option value="plain">{t`Plain`}</option><option value="card">{t`Soft card`}</option><option value="banner">{t`Accent banner`}</option><option value="outline">{t`Outlined card`}</option>
      </select>
    </label>
    {component.treatment && component.treatment !== "plain" && <>
      <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Color palette</Trans><select className="h-9 rounded border bg-background px-2 text-foreground" value={component.palette ?? "custom"} onChange={(e) => onChange({ palette: e.target.value as PublisherComponent["palette"] })}><option value="book" disabled={!hasBookAccent}>{t`Book accent`}</option><option value="custom">{t`Custom colors`}</option></select></label>
      {component.treatment !== "banner" && <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Box header</Trans><select className="h-9 rounded border bg-background px-2 text-foreground" value={component.header ?? "none"} onChange={(e) => onChange({ header: e.target.value as PublisherComponent["header"] })}><option value="none">{t`No header band`}</option><option value="solid">{t`Solid accent`}</option><option value="tint">{t`Soft tint`}</option></select></label>}
      {component.header && component.header !== "none" && component.treatment !== "banner" && <NumberField label={t`Header size (px)`} value={component.headerSize ?? 20} min={12} max={60} onChange={(headerSize) => onChange({ headerSize })} />}
      <p className="text-[11px] leading-relaxed text-muted-foreground"><Trans>The first heading becomes the box header. Text colors adjust to the fill for contrast; headings and labels retain their meaning without color.</Trans></p>
    </>}
  </div>
}
