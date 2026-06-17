import { Globe } from "lucide-react";
import { useLingui } from "@lingui/react";
import { msg } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import type { MessageDescriptor } from "@lingui/core";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCALES, LOCALE_FLAGS, type AppLocale } from "@/i18n/locales";

const LOCALE_LABEL_MESSAGES: Record<AppLocale, MessageDescriptor> = {
  en: msg`English`,
  "pt-BR": msg`Portuguese (BR)`,
  es: msg`Spanish`,
  fr: msg`French`,
  sq: msg`Albanian`,
};

function localeCode(loc: AppLocale): string {
  return loc.slice(0, 2).toUpperCase();
}

export type LocaleSwitcherVariant = "topbar" | "standalone";

export function LocaleSwitcher({
  className,
  variant = "topbar",
}: {
  className?: string;
  variant?: LocaleSwitcherVariant;
}) {
  const { i18n: lingui } = useLingui();
  const currentLocale = lingui.locale as AppLocale;

  const handleChange = (value: string) => {
    if (!LOCALES.includes(value as AppLocale)) return;
    const next = value as AppLocale;
    if (next === currentLocale) return;
    i18n.activate(next);
    const search = new URLSearchParams(window.location.search);
    search.set("lang", next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${search.toString()}`,
    );
  };

  return (
    <Select value={currentLocale} onValueChange={handleChange}>
      <SelectTrigger
        aria-label={lingui._(msg`Change language`)}
        className={cn(
          variant === "topbar"
            ? "h-8 border-none! bg-transparent! cursor-pointer text-white/70 hover:text-white hover:bg-gray-600! outline-none focus-visible:ring-2! focus-visible:ring-ring! focus-visible:ring-offset-2!"
            : "h-8 w-auto gap-2 rounded-lg border-border bg-card/80 px-3 backdrop-blur hover:bg-accent cursor-pointer",
          className,
        )}
      >
        <SelectValue
          asChild
          placeholder={
            <span className="flex w-8 items-center justify-center">
              <Globe className="h-4 w-4" />
            </span>
          }
        >
          <div className="flex items-center gap-2 uppercase pr-1">
            <Globe className="h-4 w-4" />
            <span className="text-xs font-medium leading-none">
              {localeCode(currentLocale)}
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[160px]" sideOffset={2} align="end">
        {LOCALES.map((loc) => (
          <SelectItem key={loc} value={loc}>
            <span className="flex items-center gap-2">
              <span className="text-base leading-none">
                {LOCALE_FLAGS[loc]}
              </span>
              <span className="text-xs">
                {lingui._(LOCALE_LABEL_MESSAGES[loc])}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
