import usFlag from "@/assets/flags/us.svg"
import brFlag from "@/assets/flags/br.svg"
import esFlag from "@/assets/flags/es.svg"
import frFlag from "@/assets/flags/fr.svg"
import xkFlag from "@/assets/flags/xk.svg"
import type { AppLocale } from "@/i18n/locales"

export const LOCALE_FLAG_SRC: Record<AppLocale, string> = {
  en: usFlag,
  "pt-BR": brFlag,
  es: esFlag,
  fr: frFlag,
  sq: xkFlag,
}
