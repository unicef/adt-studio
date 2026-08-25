import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, Search } from "lucide-react"
import type { TocSection } from "@/api/client"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"

export interface TocSectionPickerProps {
  value: string
  sections: TocSection[]
  hex: string
  onChange: (sectionId: string, href: string) => void
}

export function TocSectionPicker({ value, sections, hex, onChange }: TocSectionPickerProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")

  const current = useMemo(
    () => sections.find((section) => section.sectionId === value) ?? null,
    [sections, value],
  )

  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return sections
    return sections.filter(
      (section) =>
        section.title.toLowerCase().includes(query) ||
        section.sectionId.toLowerCase().includes(query),
    )
  }, [sections, filter])

  const linked = value !== ""
  const triggerLabel = current
    ? t`p${current.pageNumber}`
    : linked
      ? value.slice(0, 12)
      : t`Link page`

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
          title={linked ? t`Linked to ${value}` : t`No page linked`}
          className={cn(
            "flex h-6 max-w-[150px] shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
            !linked && "border-dashed text-muted-foreground hover:text-foreground",
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

      <PopoverContent align="end" className="w-72 p-0">
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
          {shown.length === 0 ? (
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
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors",
                    active ? "font-semibold" : "hover:bg-muted",
                  )}
                  style={active ? { background: tint(hex, 0.12), color: hex } : undefined}
                >
                  <span className="w-6 shrink-0 font-mono text-[10px] tabular-nums opacity-70">
                    {t`p${section.pageNumber}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{section.title}</span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
