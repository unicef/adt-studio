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
 * a short label, and the setting it brings. The longer meaning is in the button's name and on hover.
 */
export function OptionCard({ title, detail, tag, guess, look, moved, device, file, pages, width, height, chosen, onChoose, index }: { title: string; detail: string; tag?: string; guess?: boolean; look: Look; moved: SetupSettingId[]; device: Device; file: File | null; pages: number[]; width: number; height: number; chosen: boolean; onChoose: () => void; index: number }) {
  const { t, i18n } = useLingui()
  const describe = useDescribe()
  const srcs = useScreenImages(file, pages)
  const scale = fitScale(device, width, height)
  const brings = moved.slice(0, 2).map((id) => {
    const value = CHOICES[id].find((c) => c.value === String(look[id]))
    return { id, label: i18n._(SETTING_LABEL[id]), value: value ? i18n._(value.title) : String(look[id]) }
  })
  const desc = describe(look, device, pages)
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={chosen}
      aria-label={t`${title}. ${detail} ${desc}`}
      title={detail}
      className={cn(
        "group relative flex min-w-0 flex-col items-stretch gap-3 rounded-[22px] bg-card p-3 text-left transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        "animate-[am-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none",
        chosen ? "shadow-[0_14px_34px_-14px_rgba(43,127,255,0.7)] ring-2 ring-brand-500" : "shadow-[0_10px_28px_-18px_rgba(15,23,42,0.45)] ring-1 ring-border hover:ring-brand-300",
      )}
      style={{ animationDelay: `${120 + index * 90}ms` }}
    >
      <span className="grid place-items-center rounded-[16px] bg-gradient-to-br from-brand-50 to-brand-100/70 py-3" style={{ minHeight: height + 24 }}>
        <BookDevice device={device} scale={scale} shown={look} srcs={srcs} label={desc} />
      </span>
      <span className="flex items-center gap-2.5 px-1 pb-1">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">{title}</span>
            {tag && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", guess ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-muted text-muted-foreground ring-border")}>{tag}</span>}
          </span>
          {brings.length > 0 && (
            <span className="truncate text-[12px] text-muted-foreground">
              {brings.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && " · "}
                  {b.label} <span className="font-semibold text-foreground">{b.value}</span>
                </span>
              ))}
            </span>
          )}
        </span>
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200", chosen ? "border-brand-600 bg-brand-600 text-primary-foreground" : "border-border group-hover:border-brand-300")}>{chosen && <Check className="size-3.5 stroke-[3]" />}</span>
      </span>
    </button>
  )
}
