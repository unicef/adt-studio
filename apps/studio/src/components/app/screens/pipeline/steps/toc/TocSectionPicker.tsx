import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { useMissingSectionLabel, type TocSectionOption } from "./useTocSectionOptions"

export interface TocSectionPickerProps {
  value: string
  sections: readonly TocSectionOption[]
  hex: string
  className?: string
  disabled?: boolean
  loadFailed?: boolean
  onRetry?: () => void
  onChange: (sectionId: string, href: string) => void
}

export function TocSectionPicker({ value, sections, hex, className, disabled = false, loadFailed = false, onRetry, onChange }: TocSectionPickerProps) {
  const { t } = useLingui()
  const missingLabel = useMissingSectionLabel()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")

  const current = useMemo(
    () => sections.find((section) => section.sectionId === value) ?? null,
    [sections, value],
  )

  const shown = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase()
    if (!query) return sections
    return sections.filter((section) => section.search.includes(query))
  }, [sections, filter])

  const linked = value !== ""
  const triggerLabel = current ? t`p${current.pageNumber} · ${current.label}` : linked ? missingLabel(value) : t`Link page`
  const description = current
    ? t`Links to page ${current.pageNumber}: ${current.label}`
    : linked
      ? t`Links to ${missingLabel(value)}`
      : t`Link to a page`

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setFilter("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={description}
          title={linked ? `${description} (${value})` : t`No page linked`}
          className={cn(
            "flex h-6 max-w-[180px] shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors disabled:cursor-default disabled:opacity-100",
            !linked && "border-dashed text-muted-foreground hover:text-foreground",
            className,
          )}
          style={
            linked
              ? { borderColor: tint(hex, 0.4), background: tint(hex, 0.12), color: hex }
              : undefined
          }
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="size-2.5 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            className="h-8"
            prependIcon={<Search className="size-3.5" />}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t`Search sections…`}
            aria-label={t`Search sections`}
          />
        </div>

        <div className="max-h-60 overflow-y-auto p-1">
          {loadFailed ? (
            <div role="alert" className="flex items-center justify-center gap-2 px-2 py-4 text-[11px] text-muted-foreground">
              <Trans>Couldn't load sections</Trans>
              {onRetry && (
                <button type="button" onClick={onRetry} className="font-medium text-foreground underline-offset-4 hover:underline">
                  <Trans>Retry</Trans>
                </button>
              )}
            </div>
          ) : shown.length === 0 ? (
            <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
              <Trans>No matching sections.</Trans>
            </div>
          ) : (
            shown.map((section) => {
              const active = section.sectionId === value
              return (
                <button
                  key={section.sectionId}
                  type="button"
                  onClick={() => {
                    onChange(section.sectionId, section.href)
                    setOpen(false)
                  }}
                  title={section.sectionId}
                  aria-current={active || undefined}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors",
                    active ? "font-semibold" : "hover:bg-muted",
                  )}
                  style={active ? { background: tint(hex, 0.12), color: hex } : undefined}
                >
                  <span className="w-7 shrink-0 pt-px font-mono text-[10px] tabular-nums opacity-70">
                    {t`p${section.pageNumber}`}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{section.label}</span>
                    {section.detail && (
                      <span className={cn("truncate text-[10.5px] font-normal", active ? "opacity-80" : "text-muted-foreground")}>{section.detail}</span>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
