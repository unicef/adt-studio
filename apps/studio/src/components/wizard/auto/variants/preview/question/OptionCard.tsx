import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import type { SetupSettingId } from "@adt/types"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { CHOICES, SETTING_LABEL } from "../labels"
import type { Look } from "../useSetup"
import { BookDevice, fitScale } from "../stage/BookDevice"
import type { Device } from "../stage/layouts"
import { useDescribe, useScreenImages } from "../stage/pages"

/**
 * One answer to a question, shown as what the book would look like with it: the outcome preview,
 * the answer in plain words, and the settings that answer brings. Choosing it answers the question.
 */
export function OptionCard({ title, body, tag, look, moved, device, file, pages, width, height, chosen, onChoose, index }: { title: string; body: string; tag?: ReactNode; look: Look; moved: SetupSettingId[]; device: Device; file: File | null; pages: number[]; width: number; height: number; chosen: boolean; onChoose: () => void; index: number }) {
  const { t, i18n } = useLingui()
  const describe = useDescribe()
  const srcs = useScreenImages(file, pages)
  const scale = fitScale(device, width, height)
  const brings = moved.map((id) => {
    const value = CHOICES[id].find((c) => c.value === String(look[id]))
    return { id, label: i18n._(SETTING_LABEL[id]), value: value ? i18n._(value.title) : String(look[id]) }
  })
  const desc = describe(look, device, pages)
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={chosen}
      aria-label={t`${title}. ${body} ${desc}`}
      className={cn(
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 group relative flex min-w-0 flex-col items-stretch gap-3 rounded-[22px] bg-card p-3 text-left transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        "animate-[am-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none",
        chosen ? "shadow-[0_14px_34px_-14px_rgba(43,127,255,0.7)] ring-2 ring-brand-500" : "shadow-[0_10px_28px_-18px_rgba(15,23,42,0.45)] ring-1 ring-border hover:ring-brand-300",
      )}
      style={{ animationDelay: `${120 + index * 90}ms` }}
    >
      <span className="grid place-items-center rounded-[16px] bg-gradient-to-br from-brand-50 to-brand-100/70 py-3" style={{ minHeight: height + 24 }}>
        <BookDevice device={device} scale={scale} shown={look} srcs={srcs} label={desc} />
      </span>
      <span className="flex items-start gap-2.5 px-1">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {tag}
          <span className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">{title}</span>
          <span className="text-[13px] leading-snug text-muted-foreground">{body}</span>
        </span>
        <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200", chosen ? "border-brand-600 bg-brand-600 text-primary-foreground" : "border-border group-hover:border-brand-300")}>{chosen && <Check className="size-3.5 stroke-[3]" />}</span>
      </span>
      {brings.length > 0 && (
        <span className="flex flex-wrap gap-1.5 px-1 pb-1">
          {brings.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
              {b.label}
              <span className="font-semibold text-foreground">{b.value}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  )
}
