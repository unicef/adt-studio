import type { KeyboardEvent } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { FORMAT_ORDER } from "@/components/pipeline/stages/export/components/FormatPicker"
import type { ExportFormat } from "@/components/pipeline/stages/export/export-formats"
import { cn } from "@/lib/utils"
import { FormatBadge, accentStyle, useFormatMeta } from "../ExportParts"
import type { ExportFlow } from "../useExportFlow"

const NEXT_KEYS: Record<string, number> = { ArrowDown: 3, ArrowRight: 1, ArrowUp: -3, ArrowLeft: -1 }

function moveFormatFocus(event: KeyboardEvent<HTMLDivElement>, flow: ExportFlow) {
  const step = NEXT_KEYS[event.key]
  if (!step) return
  const radios = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio][data-format]")]
  const index = radios.findIndex((radio) => radio === document.activeElement)
  if (index < 0) return
  event.preventDefault()
  const next = radios[(index + step + radios.length) % radios.length]
  next.focus()
  flow.setFormat(next.dataset.format as ExportFormat)
}

function FormatCard({ flow, format }: { flow: ExportFlow; format: ExportFormat }) {
  const meta = useFormatMeta(flow, format)
  const selected = flow.format === format
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-format={format}
      onClick={() => flow.setFormat(format)}
      style={selected ? accentStyle(format) : undefined}
      className={cn(
        "group relative flex h-[132px] flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left outline-none transition-[background-color,border-color,box-shadow,translate] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-(--accent-solid)/50 motion-reduce:transition-none",
        selected
          ? "-translate-y-0.5 border-transparent bg-[color-mix(in_oklab,var(--accent)_9%,var(--card))] shadow-[inset_0_0_0_1.5px_var(--accent),0_10px_24px_-14px_var(--accent)]"
          : "bg-card hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_10px_24px_-16px_rgba(0,0,0,0.25)]",
      )}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl border", meta.bgLight, meta.borderColor, "dark:border-white/10 dark:bg-white/[0.06]")}>
        <meta.icon className={cn("size-5", meta.textColor)} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold">{meta.label}</span>
          <FormatBadge flow={flow} format={format} />
        </span>
        <span className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{meta.bestFor}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-(--accent-solid) text-white transition-[opacity,scale] duration-200 ease-out",
          selected ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      >
        <Check className="size-3" strokeWidth={3.5} />
      </span>
    </button>
  )
}

export function FormatGrid({ flow }: { flow: ExportFlow }) {
  const { t } = useLingui()
  return (
    <div role="radiogroup" aria-label={t`Format`} className="grid grid-cols-3 gap-3" onKeyDown={(event) => moveFormatFocus(event, flow)}>
      {FORMAT_ORDER.map((format) => (
        <FormatCard key={format} flow={flow} format={format} />
      ))}
    </div>
  )
}
