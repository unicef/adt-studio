import { ArrowDownAZ, ArrowDownWideNarrow, ArrowDownZA, ArrowUpDown, ArrowUpNarrowWide, Check, ChevronDown, ListOrdered, type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { Fragment, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { HEADER_BUTTON, HEADER_MENU_OPEN } from "../shared/headerButton"

export type GlossarySort = "book" | "az" | "za" | "usage" | "rare"

interface SortOption {
  value: GlossarySort
  label: string
  icon: LucideIcon
}

export function SortMenu({ value, onChange }: { value: GlossarySort; onChange: (value: GlossarySort) => void }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const groups: { label?: string; options: SortOption[] }[] = [
    { options: [{ value: "book", label: t`Book order`, icon: ListOrdered }] },
    {
      label: t`Alphabetical`,
      options: [
        { value: "az", label: t`A–Z`, icon: ArrowDownAZ },
        { value: "za", label: t`Z–A`, icon: ArrowDownZA },
      ],
    },
    {
      label: t`By usage`,
      options: [
        { value: "usage", label: t`Most used`, icon: ArrowDownWideNarrow },
        { value: "rare", label: t`Least used`, icon: ArrowUpNarrowWide },
      ],
    },
  ]
  const options = groups.flatMap((group) => group.options)
  const current = options.find((option) => option.value === value) ?? options[0]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t`Sort: ${current.label}`} className={cn(HEADER_BUTTON, HEADER_MENU_OPEN, "gap-1.5 px-3 font-medium text-foreground")}>
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{t`Sort`}</span>
          {current.label}
          <ChevronDown className={cn("size-3 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-48 p-1">
        <div role="menu" aria-label={t`Sort terms`}>
          {groups.map((group, index) => (
            <Fragment key={group.options[0].value}>
              {index > 0 && <div role="separator" className="mx-1 my-1 h-px bg-border" />}
              {group.label && <p className="px-2 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground">{group.label}</p>}
              {group.options.map((option) => {
                const active = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                      active ? "bg-muted font-medium text-foreground" : "text-foreground hover:bg-muted/60",
                    )}
                  >
                    <option.icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{option.label}</span>
                    {active && <Check className="size-3.5" />}
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
