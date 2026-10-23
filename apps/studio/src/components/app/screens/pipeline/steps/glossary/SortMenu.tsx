import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpDown, Check, ChevronDown, ListOrdered, type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type GlossarySort = "book" | "az" | "usage"

export function SortMenu({ value, onChange }: { value: GlossarySort; onChange: (value: GlossarySort) => void }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const options: { value: GlossarySort; label: string; icon: LucideIcon }[] = [
    { value: "book", label: t`Book order`, icon: ListOrdered },
    { value: "az", label: t`A–Z`, icon: ArrowDownAZ },
    { value: "usage", label: t`Most used`, icon: ArrowDownWideNarrow },
  ]
  const current = options.find((option) => option.value === value) ?? options[0]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t`Sort: ${current.label}`}
          className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{t`Sort`}</span>
          {current.label}
          <ChevronDown className={cn("size-3 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-44 p-1">
        <div role="menu" aria-label={t`Sort terms`}>
          {options.map((option) => {
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
        </div>
      </PopoverContent>
    </Popover>
  )
}
