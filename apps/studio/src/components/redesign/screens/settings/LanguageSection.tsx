import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Info } from "lucide-react"
import { activateLocale, type AppLocale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import { SettingsCard, SettingsHeading, SettingsLead } from "./ui"
import { LOCALE_OPTIONS } from "./options"
import { LOCALE_FLAG_SRC } from "./flags"
import { localeAnchor } from "./nav"

export function LanguageSection() {
  const { t, i18n } = useLingui()

  const changeLocale = (next: AppLocale) => {
    if (next === i18n.locale) return
    activateLocale(next)
    const search = new URLSearchParams(window.location.search)
    search.set("lang", next)
    window.history.replaceState(null, "", `${window.location.pathname}?${search.toString()}`)
  }

  return (
    <>
      <SettingsHeading>
        <Trans>Language</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Choose the language ADT Studio's interface is shown in.</Trans>
      </SettingsLead>

      <SettingsCard className="p-1.5">
        <div className="flex flex-col gap-0.5" role="radiogroup" aria-label={t`Interface language`}>
          {LOCALE_OPTIONS.map((l) => {
            const sel = i18n.locale === l.key
            return (
              <button
                key={l.key}
                id={localeAnchor(l.key)}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => changeLocale(l.key)}
                className={cn(
                  "group flex w-full scroll-mt-24 items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.99]",
                  sel
                    ? "bg-brand-50 dark:bg-brand-500/10"
                    : "hover:bg-black/[0.035] dark:hover:bg-white/5",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-muted ring-1 ring-inset transition-shadow duration-150",
                    sel ? "ring-brand-600/40" : "ring-black/10 dark:ring-white/15",
                  )}
                >
                  <img
                    src={LOCALE_FLAG_SRC[l.key]}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "truncate text-[13.5px] font-medium leading-tight",
                      sel ? "text-brand-800" : "text-foreground",
                    )}
                  >
                    {i18n._(l.native)}
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground">
                    {i18n._(l.name)}
                  </div>
                </div>
                <span
                  className={cn(
                    "grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-150",
                    sel
                      ? "border-brand-600 bg-brand-600"
                      : "border-border group-hover:border-brand-300",
                  )}
                >
                  <Check
                    className={cn(
                      "size-3 text-primary-foreground transition-[opacity,transform] duration-150 ease-out",
                      sel ? "scale-100 opacity-100" : "scale-50 opacity-0",
                    )}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </SettingsCard>

      <p className="mt-3 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        <span>
          <Trans>
            This only changes ADT Studio's interface. It does not affect the languages your books
            are generated in.
          </Trans>
        </span>
      </p>
    </>
  )
}
