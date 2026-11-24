import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronRight, Lock } from "lucide-react"
import type { SetupSettingId } from "@adt/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RULE_WHY } from "../../../engine/words"
import type { BookSetting, SettingValue } from "../model"
import { useSettingWords } from "../useBookState"
import { BookmarkEditor } from "./BookmarkEditor"
import { SourceMark } from "./SourceMark"

function Row({ setting, onChange, onShowPages }: { setting: BookSetting; onChange: (v: SettingValue) => void; onShowPages: (page: number) => void }) {
  const { i18n } = useLingui()
  const words = useSettingWords()
  const [open, setOpen] = useState(false)
  const why = RULE_WHY[setting.rule]
  return (
    <li>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 data-[state=open]:bg-muted/60">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {words.name(setting.id)}
                {setting.locked && (
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
                {words.value(setting.id, setting.value)}
              </span>
              {why && setting.source !== "changed" && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{i18n._(why)}</span>}
            </span>
            <SourceMark source={setting.source} withText />
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" collisionPadding={16} className="w-[340px] max-w-[calc(100vw-32px)] rounded-2xl p-4">
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
    </li>
  )
}

/** The bookmarks as plain rows, for the list view. */
export function SettingsList({ settings, onChange, onShowPages }: { settings: BookSetting[]; onChange: (id: SetupSettingId, v: SettingValue) => void; onShowPages: (page: number) => void }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-[22px] border bg-card p-1.5">
      {settings.map((s) => (
        <Row key={s.id} setting={s} onChange={(v) => onChange(s.id, v)} onShowPages={onShowPages} />
      ))}
    </ul>
  )
}
