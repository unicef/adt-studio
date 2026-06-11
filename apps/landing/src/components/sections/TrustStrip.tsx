import { Apple, Github, Laptop, Lock, MonitorPlay, ShieldCheck } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

const ITEMS = [
  { Icon: ShieldCheck, label: msg`MIT licensed` },
  { Icon: Lock, label: msg`Runs locally` },
  { Icon: Github, label: msg`Open source` },
  { Icon: Apple, label: msg`macOS` },
  { Icon: MonitorPlay, label: msg`Windows` },
  { Icon: Laptop, label: msg`Linux` },
];

export function TrustStrip() {
  const { t, i18n } = useLingui();
  return (
    <section
      aria-label={t`Trust`}
      className="relative border-y border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)]">
          <Trans>Built with UNICEF</Trans>
        </span>
        <span aria-hidden className="hidden h-3 w-px bg-[color:var(--color-border)] sm:block" />
        {ITEMS.map(({ Icon, label }) => (
          <span
            key={label.id}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--color-muted-foreground)]"
          >
            <Icon className="h-3.5 w-3.5" />
            {i18n._(label)}
          </span>
        ))}
      </div>
    </section>
  );
}
