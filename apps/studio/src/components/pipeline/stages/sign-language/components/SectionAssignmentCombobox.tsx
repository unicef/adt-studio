import { useMemo, useRef, useState } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { SectionEntry } from "./types"

interface SectionAssignmentComboboxProps {
  sections: SectionEntry[]
  disabled?: boolean
  onAssign: (sectionId: string | null) => void
}

function matchesQuery(section: SectionEntry, query: string): boolean {
  return [section.sectionLabel, section.pageLabel, section.sectionId]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query)
}

/** A searchable section picker for assigning an unassigned sign-language video. */
export function SectionAssignmentCombobox({
  sections,
  disabled = false,
  onAssign,
}: SectionAssignmentComboboxProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingSections = useMemo(
    () =>
      normalizedQuery
        ? sections.filter((section) => matchesQuery(section, normalizedQuery))
        : sections,
    [normalizedQuery, sections],
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery("")
  }

  const select = (sectionId: string | null) => {
    onAssign(sectionId)
    handleOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-7 w-32 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-left text-[11px]",
            "ring-offset-0 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-600",
            "data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-cyan-600",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span className="truncate">{t`Assign...`}</span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-72 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="border-b p-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matchingSections.length > 0) {
                event.preventDefault()
                select(matchingSections[0].sectionId)
              }
            }}
            placeholder={t`Search sections`}
            prependIcon={<Search className="h-3.5 w-3.5" aria-hidden />}
            className="h-8 text-[12px]"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected
            onClick={() => select(null)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <Check className="h-3.5 w-3.5 shrink-0 text-cyan-600" aria-hidden />
            <span><Trans>Unassigned</Trans></span>
          </button>
          {matchingSections.map((section) => (
            <button
              key={section.sectionId}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => select(section.sectionId)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 pl-8 text-left text-[12px] transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className="truncate">{section.sectionLabel}</span>
            </button>
          ))}
          {matchingSections.length === 0 ? (
            <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
              <Trans>No sections found</Trans>
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
