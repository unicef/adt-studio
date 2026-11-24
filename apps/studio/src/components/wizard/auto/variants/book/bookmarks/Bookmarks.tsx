import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Lock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { SetupSettingId } from "@adt/types"
import { SETTING_IDS } from "../../../engine/answers"
import type { BookSetting, SettingValue } from "../model"
import { useSettingWords } from "../useBookState"
import { BookmarkEditor } from "./BookmarkEditor"
import { SourceMark } from "./SourceMark"

export type BookmarkLayout = "side" | "top"

const STRIPE: Record<BookSetting["source"], string> = { ai: "bg-brand-500", answered: "bg-emerald-500", changed: "bg-amber-500" }

function Tab({ setting, layout, flash, onChange, onShowPages }: { setting: BookSetting; layout: BookmarkLayout; flash: boolean; onChange: (v: SettingValue) => void; onShowPages: (page: number) => void }) {
  const words = useSettingWords()
  const [open, setOpen] = useState(false)
  const side = layout === "side"
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative flex shrink-0 items-center gap-2 border bg-card text-left shadow-[0_6px_16px_-10px_rgba(15,23,42,0.45)] outline-none transition-[transform,box-shadow,border-color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-brand-400",
            side ? "min-h-[52px] w-[214px] rounded-r-xl border-l-0 py-1.5 pl-6 pr-2.5 hover:translate-x-1.5 data-[state=open]:translate-x-1.5" : "h-[60px] w-[148px] snap-start items-start rounded-t-xl border-b-0 px-3 pt-2.5 hover:-translate-y-1 data-[state=open]:-translate-y-1",
            flash && "border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]",
          )}
        >
          <span aria-hidden className={cn("absolute rounded-full", side ? "inset-y-2 left-3 w-[3px]" : "inset-x-3 top-1 h-[3px]", STRIPE[setting.source])} />
          <span className={cn("min-w-0 flex-1", !side && "w-full")}>
            <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <span className="truncate">{words.name(setting.id)}</span>
              {setting.locked && (
                <>
                  <Lock aria-hidden className="size-2.5 shrink-0" />
                  <span className="sr-only">
                    <Trans>, fixed once the book is created</Trans>
                  </span>
                </>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <span key={String(setting.value)} className={cn("block min-w-0 flex-1 text-[13.5px] font-semibold leading-tight", side ? "line-clamp-2" : "truncate", flash && "animate-[am-pop_0.35s_cubic-bezier(0.34,1.56,0.64,1)_both] motion-reduce:animate-none")}>
                <span className="sr-only">: </span>
                {words.value(setting.id, setting.value)}
              </span>
              {!side && (
                <>
                  <span className="sr-only">. </span>
                  <SourceMark source={setting.source} className="size-4 [&_svg]:size-2.5" />
                </>
              )}
            </span>
          </span>
          {side && (
            <>
              <span className="sr-only">. </span>
              <SourceMark source={setting.source} />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side={side ? "right" : "bottom"} align={side ? "start" : "center"} sideOffset={10} collisionPadding={16} className="w-[340px] max-w-[calc(100vw-32px)] rounded-2xl p-4">
        <BookmarkEditor
          setting={setting}
          onChange={onChange}
          onShowPages={(page) => {
            setOpen(false)
            onShowPages(page)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** While the AI reads, the bookmarks are there with their names, and their values are still blank. */
function Waiting({ id, layout, index }: { id: SetupSettingId; layout: BookmarkLayout; index: number }) {
  const words = useSettingWords()
  const side = layout === "side"
  return (
    <span
      className={cn(
        "relative flex shrink-0 flex-col justify-center gap-1.5 border bg-card/80 animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none",
        side ? "h-[52px] w-[214px] rounded-r-xl border-l-0 pl-6 pr-3" : "h-[60px] w-[148px] justify-start rounded-t-xl border-b-0 px-3 pt-2.5",
      )}
      style={{ animationDelay: `${300 + index * 90}ms` }}
    >
      <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">{words.name(id)}</span>
      <span aria-hidden className="h-2.5 w-[70%] rounded-full bg-muted-foreground/15 motion-safe:animate-pulse" />
    </span>
  )
}

/**
 * The settings as bookmarks sticking out of the book: along its right edge on wide screens
 * (`side`), out of its top edge on narrow ones (`top`, scrolls sideways). Each opens its editor.
 */
export function Bookmarks({ settings, layout, flash, onChange, onShowPages, className }: { settings: BookSetting[] | null; layout: BookmarkLayout; flash: Set<SetupSettingId>; onChange: (id: SetupSettingId, v: SettingValue) => void; onShowPages: (page: number) => void; className?: string }) {
  const { t } = useLingui()
  const side = layout === "side"
  return (
    <div
      role={settings ? "list" : undefined}
      aria-label={t`Settings`}
      className={cn("flex", side ? "flex-col gap-1.5" : "snap-x gap-1 overflow-x-auto px-1 pt-2 [scrollbar-width:none]", className)}
    >
      {settings
        ? settings.map((s, i) => (
            <div role="listitem" key={s.id} className="shrink-0 animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <Tab setting={s} layout={layout} flash={flash.has(s.id)} onChange={(v) => onChange(s.id, v)} onShowPages={onShowPages} />
            </div>
          ))
        : SETTING_IDS.map((id, i) => <Waiting key={id} id={id} layout={layout} index={i} />)}
    </div>
  )
}
