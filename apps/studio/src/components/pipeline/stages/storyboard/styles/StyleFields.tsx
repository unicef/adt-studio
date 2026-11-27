import { useLingui } from "@lingui/react/macro"
import { Input } from "@/components/ui/input"

export function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1.5 text-xs text-muted-foreground">{label}<Input type="number" className="h-8 text-foreground" value={value} min={min} max={max} step={step} onChange={(e) => { if (e.target.value !== "" && e.target.validity.valid) onChange(Number(e.target.value)) }} /></label>
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useLingui()
  return <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">{label}<span className="flex items-center gap-2 font-mono text-[10px]"><span>{value === "transparent" ? t`None` : value}</span><input aria-label={label} type="color" className="h-7 w-9 cursor-pointer rounded border bg-transparent" value={value === "transparent" ? "#ffffff" : value} onChange={(e) => onChange(e.target.value)} /></span></label>
}

