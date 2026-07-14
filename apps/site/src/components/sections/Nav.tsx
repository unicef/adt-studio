import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Button } from "@/components/Button";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { cn } from "@/lib/cn";
import { DOCS_ENABLED } from "@/lib/flags";
import { withBase } from "@/lib/href";
import { useScrolled } from "@/lib/useScrolled";
import { useSectionNav } from "@/lib/useSectionNav";
import { trackEvent } from "@/lib/matomo";

const LINKS: { href: string; id: string; label: MessageDescriptor }[] = [
  { href: "/#top", id: "top", label: msg`Home` },
  { href: "/#features", id: "features", label: msg`Features` },
  { href: "/#carousel", id: "carousel", label: msg`How it works` },
  { href: "/#demos", id: "demos", label: msg`Demos` },
  { href: "/#showcase", id: "showcase", label: msg`Output` },
  { href: "/#releases", id: "releases", label: msg`Releases` },
  ...(DOCS_ENABLED
    ? [{ href: "/#docs", id: "docs", label: msg`Docs` }]
    : []),
  { href: "/#finale", id: "finale", label: msg`Get started` },
];

const HOME_IDS = LINKS.map((l) => l.id);
const EMPTY_IDS: readonly string[] = [];

export function Nav({ isHome = false }: { isHome?: boolean }) {
  const { t, i18n } = useLingui();
  const scrolled = useScrolled(8);
  const ids = useMemo(() => (isHome ? HOME_IDS : EMPTY_IDS), [isHome]);
  const { activeId } = useSectionNav(ids);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 w-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        scrolled
          ? "border-b border-[color:var(--color-border)]/80 bg-[color:var(--color-background)]/75 backdrop-blur-xl shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-20px_rgba(0,0,0,0.18)]"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-6xl items-center gap-6 px-4 transition-all duration-300",
          scrolled ? "h-14" : "h-16",
        )}
      >
        <a
          href={withBase("/#top")}
          className="group flex items-center gap-2.5"
          aria-label={t`ADT Studio home`}
        >
          <span className="relative inline-flex">
            <span
              aria-hidden
              className="absolute inset-0 rounded-md bg-[color:var(--color-primary)]/30 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100"
            />
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
              width={26}
              height={26}
              className="relative rounded-md transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
            />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-[color:var(--color-foreground)]">
            ADT Studio
          </span>
        </a>

        <nav
          aria-label={t`Primary`}
          className="ml-auto hidden items-center gap-0.5 md:flex"
        >
          {LINKS.filter((l) => l.id !== "top").map((l) => {
            const active = l.id === activeId;
            return (
              <a
                key={l.href}
                href={withBase(l.href)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-200",
                  active
                    ? "text-[color:var(--color-foreground)]"
                    : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-accent)]/60 hover:text-[color:var(--color-foreground)]",
                )}
              >
                {i18n._(l.label)}
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-3 bottom-0 h-px origin-center rounded-full bg-[color:var(--color-primary)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    active ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-4">
          <Button
            href="https://github.com/unicef/adt-studio"
            target="_blank"
            rel="noreferrer noopener"
            variant="ghost"
            size="md"
            className="hidden h-9 gap-1.5 px-3 text-[13px] sm:inline-flex"
          >
            <GithubIcon className="h-3.5 w-3.5" />
            <Trans>Star</Trans>
          </Button>
          <Button
            href={withBase("/download")}
            variant="primary"
            size="md"
            className="hidden h-9 px-4 text-[13px] sm:inline-flex"
            onClick={() => trackEvent("cta", "download_click", "nav")}
          >
            <Trans>Download</Trans>
          </Button>
          <LocaleSwitcher />
          <button
            type="button"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-accent)] md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t`Close menu` : t`Open menu`}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "md:hidden overflow-hidden border-t border-[color:var(--color-border)] bg-[color:var(--color-background)]/95 backdrop-blur-md transition-[max-height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open
            ? "max-h-[360px] opacity-100"
            : "pointer-events-none max-h-0 opacity-0",
        )}
      >
        <div className="flex flex-col gap-1 px-4 py-3">
          {LINKS.filter((l) => l.id !== "top").map((l) => {
            const active = l.id === activeId;
            return (
              <a
                key={l.href}
                href={withBase(l.href)}
                onClick={() => setOpen(false)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-[color:var(--color-accent)] font-semibold text-[color:var(--color-foreground)]"
                    : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-accent)]/60 hover:text-[color:var(--color-foreground)]",
                )}
              >
                {i18n._(l.label)}
              </a>
            );
          })}
          <div className="mt-2 flex items-center gap-2 border-t border-[color:var(--color-border)] pt-3">
            <Button
              href="https://github.com/unicef/adt-studio"
              target="_blank"
              rel="noreferrer noopener"
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              <GithubIcon className="h-4 w-4" />
              <Trans>Star</Trans>
            </Button>
            <Button
              href={withBase("/download")}
              variant="primary"
              size="md"
              className="flex-1"
              onClick={() => { setOpen(false); trackEvent("cta", "download_click", "nav"); }}
            >
              <Trans>Download</Trans>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
