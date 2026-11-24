import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ChevronRight, Lock, SlidersHorizontal } from "lucide-react"
import type { SetupSettingId } from "@adt/types"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { BookSetting, SettingValue } from "../model"
import { useSettingWords } from "../useBookState"
import { BookmarkEditor } from "./BookmarkEditor"
import { SourceMark } from "./SourceMark"

/** The six settings in a list; one opens its editor in place, so only one thing shows at a time. */
function SettingsPanel({ settings, onChange, onShowPages }: { settings: BookSetting[]; onChange: (id: SetupSettingId, v: SettingValue) => void; onShowPages: (page: number) => void }) {
  const words = useSettingWords()
  const [open, setOpen] = useState<SetupSettingId | null>(null)
  const current = settings.find((s) => s.id === open)
  if (current)
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-3.5" />
          <Trans>All settings</Trans>
        </button>
        <BookmarkEditor setting={current} onChange={(v) => onChange(current.id, v)} onShowPages={onShowPages} />
      </div>
    )
  return (
    <ul className="-mx-2 flex flex-col">
      {settings.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => setOpen(s.id)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {words.name(s.id)}
                {s.locked && (
                  <>
                    <Lock aria-hidden className="size-3" />
                    <span className="sr-only">
                      <Trans>, fixed once the book is created</Trans>
                    </span>
                  </>
                )}
              </span>
              <span className="block text-[14.5px] font-semibold">
                <span className="sr-only">: </span>
                {words.value(s.id, s.value)}
              </span>
            </span>
            <span className="sr-only">. </span>
            <SourceMark source={s.source} withText />
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The one bookmark out of the book: "Settings". It opens the six settings (wizard names, who set
 * each, locks), and each opens to its values.
 */
export function SettingsBookmark({ settings, layout, onChange, onShowPages, className }: { settings: BookSetting[]; layout: "side" | "top"; onChange: (id: SetupSettingId, v: SettingValue) => void; onShowPages: (page: number) => void; className?: string }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const changed = settings.filter((s) => s.source !== "ai").length
  const side = layout === "side"
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={changed ? t`Settings, ${changed} set by you` : t`Settings`}
        className={cn(
          "group flex items-center gap-2 bg-brand-600 font-semibold text-white shadow-[0_8px_20px_-10px_rgba(43,127,255,0.9)] outline-none transition-transform duration-200 ease-out focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          side ? "h-[46px] rounded-r-xl pl-6 pr-4 text-[14px] hover:translate-x-1.5" : "h-[44px] rounded-t-xl px-4 pb-2 text-[13.5px] hover:-translate-y-1",
          className,
        )}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        <Trans>Settings</Trans>
        {changed > 0 && <span aria-hidden className="grid size-5 place-items-center rounded-full bg-white/25 text-[11px]">{changed}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[420px] overflow-y-auto rounded-2xl p-5">
          <DialogTitle className="text-[18px] font-bold tracking-[-0.01em]">
            <Trans>Settings</Trans>
          </DialogTitle>
          <DialogDescription className="-mt-3 text-[13px]">
            <Trans>Picked from the notes. Open one to change it.</Trans>
          </DialogDescription>
          <SettingsPanel
            settings={settings}
            onChange={onChange}
            onShowPages={(page) => {
              setOpen(false)
              onShowPages(page)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
