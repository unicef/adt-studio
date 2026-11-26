import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Assistant } from "./Assistant"
import { COLOR_NAME, COLORS, LOOK_NAME, LOOKS, setAssistantStyle, useAssistantStyle } from "./assistantLook"

const SWATCH: Record<string, string> = { blue: "bg-brand-500", violet: "bg-violet-500", teal: "bg-teal-500", amber: "bg-amber-500", rose: "bg-rose-500" }

/**
 * Clicking the assistant opens "Customize your assistant": its look (which also names it: ADT
 * Assistant, Wizard, Buddy, Bot) and its colour, kept in this browser.
 */
export function AssistantPicker({ children }: { children: ReactNode }) {
  const { t, i18n } = useLingui()
  const style = useAssistantStyle()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t`Customize the assistant`} title={t`Customize the assistant`} className="rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand-500">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="w-[340px] rounded-[18px] p-4">
        <div className="flex flex-col gap-3">
          <span className="text-[14px] font-semibold">
            <Trans>Customize your assistant</Trans>
          </span>
          <div role="radiogroup" aria-label={t`Look`} className="grid grid-cols-4 gap-2">
            {LOOKS.map((look) => {
              const on = style.look === look
              return (
                <button key={look} type="button" role="radio" aria-checked={on} onClick={() => setAssistantStyle({ look })} className={cn("flex flex-col items-center gap-1.5 rounded-[12px] p-2 ring-1 transition-colors", on ? "bg-brand-50 ring-brand-500 dark:bg-brand-500/15" : "ring-border hover:bg-muted")}>
                  <Assistant look={look} size={44} />
                  <span className="text-[11.5px] font-medium leading-tight">{i18n._(LOOK_NAME[look]).replace(/^ADT /, "")}</span>
                </button>
              )
            })}
          </div>
          <div role="radiogroup" aria-label={t`Colour`} className="flex items-center gap-2">
            {COLORS.map((color) => {
              const on = style.color === color
              return (
                <button key={color} type="button" role="radio" aria-checked={on} aria-label={i18n._(COLOR_NAME[color])} title={i18n._(COLOR_NAME[color])} onClick={() => setAssistantStyle({ color })} className={cn("grid size-8 place-items-center rounded-full text-white ring-offset-2 ring-offset-[var(--popover)] transition-shadow", SWATCH[color], on && "ring-2 ring-foreground/70")}>
                  {on && <Check className="size-4 stroke-[3]" />}
                </button>
              )
            })}
          </div>
          <span className="text-[12.5px] leading-snug text-muted-foreground">
            <Trans>It only changes how the assistant looks. You can change it any time by clicking it.</Trans>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
