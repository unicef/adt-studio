import { useId } from "react"
import { cn } from "@/lib/utils"
import { SourceTag } from "./parts"
import { SettingSelect } from "./SettingSelect"
import { NotSureTag, WhyPopover } from "./WhyPopover"
import type { Setting } from "./setup"

/** The AI's settings as compact rows: the wizard's name, where its value came from and why, over a select with the current value. */
export function SettingRows({ settings, set, className }: { settings: Setting[]; set: (key: Setting["key"], value: string) => void; className?: string }) {
  const uid = useId()
  return (
    <ul className={cn("flex flex-col divide-y", className)}>
      {settings.map((s) => {
        const Icon = s.icon
        return (
          <li key={s.key} className="flex items-end gap-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="size-[18px]" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex h-5 items-center gap-2">
                <span id={`${uid}-${s.key}`} className="text-[12px] font-medium text-muted-foreground">{s.label}</span>
                <SourceTag source={s.source} />
                <NotSureTag setting={s} />
                <WhyPopover setting={s} className="ml-auto" />
              </span>
              <SettingSelect setting={s} labelledBy={`${uid}-${s.key}`} onPick={(v) => set(s.key, v)} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
