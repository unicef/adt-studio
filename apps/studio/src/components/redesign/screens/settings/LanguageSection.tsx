import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Check } from "lucide-react"
import { activateLocale, type AppLocale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import { HEADING, LEAD } from "./ui"

const LOCALES: { code: MessageDescriptor; name: MessageDescriptor; native: MessageDescriptor; key: AppLocale }[] = [
  { code: msg`EN`, name: msg`English`, native: msg`English`, key: "en" },
  { code: msg`PT`, name: msg`Portuguese (BR)`, native: msg`Português (Brasil)`, key: "pt-BR" },
  { code: msg`ES`, name: msg`Spanish`, native: msg`Español`, key: "es" },
  { code: msg`FR`, name: msg`French`, native: msg`Français`, key: "fr" },
  { code: msg`SQ`, name: msg`Albanian`, native: msg`Shqip`, key: "sq" },
]

export function LanguageSection() {
  const { i18n } = useLingui()

  const changeLocale = (next: AppLocale) => {
    if (next === i18n.locale) return
    activateLocale(next)
    const search = new URLSearchParams(window.location.search)
    search.set("lang", next)
    window.history.replaceState(null, "", `${window.location.pathname}?${search.toString()}`)
  }

  return (
    <>
      <div className={HEADING}>
        <Trans>Language</Trans>
      </div>
      <div className={LEAD}>
        <Trans>The language ADT Studio's interface is shown in. This does not change a book's output languages.</Trans>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {LOCALES.map((l) => {
          const sel = i18n.locale === l.key
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => changeLocale(l.key)}
              className={cn(
                "flex items-center gap-3.5 rounded-xl border-[1.5px] bg-card px-4 py-[15px] text-left transition-colors hover:border-brand-300",
                sel ? "border-brand-600 shadow-[0_0_0_3px_var(--brand-50)]" : "border-border",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-10 shrink-0 place-items-center rounded-md font-mono text-xs font-bold",
                  sel ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {i18n._(l.code)}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-semibold", sel && "text-brand-700")}>{i18n._(l.name)}</div>
                <div className="mt-px text-xs text-muted-foreground">{i18n._(l.native)}</div>
              </div>
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", sel ? "bg-brand-600 text-white" : "bg-muted")}>
                {sel && <Check className="size-3" />}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
