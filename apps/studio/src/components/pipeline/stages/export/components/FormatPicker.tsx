import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { buildExportFormatConfig, type ExportFormat } from "../export-formats"
import type { useLingui } from "@lingui/react/macro"

const FORMAT_ORDER: ExportFormat[] = ["project", "adt", "scorm", "webpub", "epub", "pnld"]

export function FormatPicker({
  selected,
  onSelect,
  t,
  errorFormat,
  isPart,
}: {
  selected: ExportFormat
  onSelect: (format: ExportFormat) => void
  t: ReturnType<typeof useLingui>["t"]
  errorFormat?: ExportFormat | null
  isPart?: boolean
}) {
  const formats = buildExportFormatConfig(t, { isPart })
  return (
    <ul className="flex flex-col gap-1.5">
      {FORMAT_ORDER.map((fmt) => {
        const cfg = formats[fmt]
        const Icon = cfg.icon
        const isActive = selected === fmt
        const hasError = errorFormat === fmt
        return (
          <li key={fmt}>
            <button
              type="button"
              onClick={() => onSelect(fmt)}
              aria-pressed={isActive}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-lg border-2 bg-white px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-200 ease-out",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60",
                isActive
                  ? cn(cfg.borderColor, cfg.bgLight, "shadow-sm")
                  : "border-[#ececec] hover:border-[#d4d4d4] hover:bg-[#fafafa]",
                hasError && "border-red-200 bg-red-50/30",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
                  cfg.bgLight,
                  cfg.borderColor,
                )}
              >
                <Icon className={cn("h-4 w-4", cfg.textColor)} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold text-[#0a0a0a]">
                    {cfg.label}
                  </span>
                  {cfg.badge && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider leading-none",
                        cfg.textColor,
                        cfg.bgLight,
                        "border",
                        cfg.borderColor,
                      )}
                    >
                      {cfg.badge}
                    </span>
                  )}
                </span>
                <span className="text-[11.5px] leading-relaxed text-[#737373] line-clamp-2">
                  {cfg.description}
                </span>
              </span>
              {isActive && (
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    cfg.buttonClass,
                  )}
                  aria-hidden
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
