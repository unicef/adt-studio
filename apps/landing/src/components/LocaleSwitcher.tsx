import { useEffect, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { MessageDescriptor } from "@lingui/core";
import { cn } from "@/lib/cn";
import { setLocale } from "@/i18n/setup";
import { LOCALES, LOCALE_FLAGS, type AppLocale } from "@/i18n/locales";

const LOCALE_LABEL_MESSAGES: Record<AppLocale, MessageDescriptor> = {
  en: msg`English`,
  "pt-BR": msg`Portuguese (BR)`,
  es: msg`Spanish`,
  fr: msg`French`,
};

export function LocaleSwitcher({ className }: { className?: string }) {
  const { i18n } = useLingui();
  const currentLocale = (
    LOCALES.includes(i18n.locale as AppLocale) ? i18n.locale : "en"
  ) as AppLocale;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect = (loc: AppLocale) => {
    setOpen(false);
    if (loc !== currentLocale) setLocale(loc);
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={i18n._(msg`Change language`)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] text-[color:var(--color-muted-foreground)] transition-colors duration-200 hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-foreground)]"
      >
        <Globe className="h-4 w-4" />
      </button>
      <div
        role="listbox"
        className={cn(
          "absolute right-0 top-full z-50 mt-2 min-w-[176px] origin-top-right overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-1 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.45)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {LOCALES.map((loc) => {
          const active = loc === currentLocale;
          return (
            <button
              key={loc}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => handleSelect(loc)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-150",
                active
                  ? "bg-[color:var(--color-accent)] text-[color:var(--color-foreground)]"
                  : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-accent)]/60 hover:text-[color:var(--color-foreground)]",
              )}
            >
              <span className="text-base leading-none">{LOCALE_FLAGS[loc]}</span>
              <span className="flex-1">{i18n._(LOCALE_LABEL_MESSAGES[loc])}</span>
              {active ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
