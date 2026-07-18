import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useOptionalElementContext } from "../element-context"
import { NumericInput } from "./NumericInput"

export interface TokenChoice {
  label: string
  value: number
}

interface TokenInputProps {
  value: number
  onChange: (next: number) => void
  tokens: ReadonlyArray<TokenChoice>
  suffix?: string
  inputMode?: "numeric" | "decimal"
  /** Optional preview rendered on the left of each Variables row. */
  renderPreview?: (token: TokenChoice) => ReactNode
  className?: string
}

export function TokenInput({
  value,
  onChange,
  tokens,
  suffix,
  inputMode = "numeric",
  renderPreview,
  className,
}: TokenInputProps) {
  const matched = tokens.find((t) => t.value === value)
  // Optional: present only inside the style-editor sidebar. Used to close the
  // popover when the selected element changes (iframe clicks bypass Radix's
  // outside-click). Absent when this control is reused elsewhere.
  const dataId = useOptionalElementContext()?.dataId
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"custom" | "variables">(
    matched ? "variables" : "custom",
  )
  const activeRowRef = useRef<HTMLButtonElement>(null)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setTab(matched ? "variables" : "custom")
  }

  // Close when the user picks a different element in the preview — clicks
  // inside the iframe don't reach Radix's outside-click listener.
  useEffect(() => {
    setOpen(false)
  }, [dataId])

  useEffect(() => {
    if (!open || tab !== "variables") return
    const id = requestAnimationFrame(() => {
      activeRowRef.current?.scrollIntoView({ block: "nearest" })
    })
    return () => cancelAnimationFrame(id)
  }, [open, tab])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            matched
              ? `${matched.label}, ${value}${suffix ?? ""}`
              : `${Number.isFinite(value) ? value : "—"}${suffix ?? ""}`
          }
          className={cn(
            "group relative flex items-center gap-2 h-8 w-full bg-muted/60 rounded-md px-2 cursor-pointer outline-none",
            "hover:bg-muted/80 transition-colors",
            "data-[state=open]:bg-background data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-violet-500",
            "focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500",
            className,
          )}
        >
          <span className="flex-1 min-w-0 text-[12px] tabular-nums text-left truncate">
            {matched ? (
              <>
                <span>{matched.label}</span>
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {value}
                  {suffix}
                </span>
              </>
            ) : (
              <>
                {Number.isFinite(value) ? value : "—"}
                <span className="text-[11px] text-muted-foreground">
                  {suffix}
                </span>
              </>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 group-hover:text-foreground/70 transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-68 p-0 rounded-xl overflow-hidden border border-border/60 shadow-xl"
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "custom" | "variables")}
          className="flex flex-col"
        >
          <div className="px-2.5 pt-2.5">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="custom" className="text-[11px]">
                <Trans>Custom</Trans>
              </TabsTrigger>
              <TabsTrigger value="variables" className="text-[11px]">
                <Trans>Variables</Trans>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="custom" className="px-2.5 pb-2.5 mt-2.5">
            <NumericInput
              value={value}
              onCommit={onChange}
              suffix={
                suffix ? (
                  <span className="text-[11px] text-muted-foreground/80 font-medium">
                    {suffix}
                  </span>
                ) : undefined
              }
              inputMode={inputMode}
              className="h-12 px-3 text-[14px] font-medium tabular-nums"
            />
          </TabsContent>

          <TabsContent value="variables" className="px-1.5 pb-2 mt-2.5">
            <div
              className={cn(
                "flex flex-col gap-1 max-h-72 overflow-y-auto py-0.5 scrollbar-hide",
              )}
            >
              {tokens.map((tok) => {
                const active = tok.value === value
                return (
                  <button
                    key={tok.label}
                    ref={active ? activeRowRef : undefined}
                    type="button"
                    title={`${tok.label} · ${tok.value}${suffix ?? ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => onChange(tok.value)}
                    onKeyDown={(e) => {
                      const t = e.currentTarget
                      if (e.key === "ArrowDown") {
                        e.preventDefault()
                        ;(
                          t.nextElementSibling as HTMLButtonElement | null
                        )?.focus()
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault()
                        ;(
                          t.previousElementSibling as HTMLButtonElement | null
                        )?.focus()
                      } else if (e.key === "Home") {
                        e.preventDefault()
                        ;(
                          t.parentElement
                            ?.firstElementChild as HTMLButtonElement | null
                        )?.focus()
                      } else if (e.key === "End") {
                        e.preventDefault()
                        ;(
                          t.parentElement
                            ?.lastElementChild as HTMLButtonElement | null
                        )?.focus()
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2.5 h-10 rounded px-2.5 cursor-pointer outline-none",
                      "transition-all duration-150 ease-out",
                      "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500",
                      active
                        ? "bg-violet-500 text-white shadow-sm hover:bg-violet-600"
                        : "text-foreground hover:bg-muted/80",
                    )}
                  >
                    {renderPreview ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-8 h-8 shrink-0 flex items-center justify-center leading-none overflow-hidden transition-colors duration-150 ease-out",
                          active ? "text-white" : "text-foreground/80",
                        )}
                      >
                        {renderPreview(tok)}
                      </span>
                    ) : null}
                    <span className="flex-1 text-left text-[13px] font-medium leading-none">
                      {tok.label}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] tabular-nums tracking-tight leading-none transition-colors duration-150 ease-out",
                        active ? "text-white/80" : "text-muted-foreground",
                      )}
                    >
                      {tok.value}
                      <span
                        className={cn(
                          "ml-0.5",
                          active ? "text-white/60" : "text-muted-foreground/60",
                        )}
                      >
                        {suffix}
                      </span>
                    </span>
                    <Check
                      aria-hidden="true"
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-opacity duration-150 ease-out",
                        active ? "opacity-100" : "opacity-0",
                      )}
                      strokeWidth={2.5}
                    />
                  </button>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
