import { Apple, Laptop, Lock, MonitorPlay, ShieldCheck } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { GithubIcon } from "@/components/icons/GithubIcon";

const ITEMS = [
  { Icon: ShieldCheck, label: msg`MIT licensed` },
  { Icon: Lock, label: msg`Runs locally` },
  { Icon: GithubIcon, label: msg`Open source` },
  { Icon: Apple, label: msg`macOS` },
  { Icon: MonitorPlay, label: msg`Windows` },
  { Icon: Laptop, label: msg`Linux` },
];

const UNICEF = {
  name: "UNICEF",
  href: "https://www.unicef.org/",
  src: "logos/unicef.svg",
  heightClass: "h-7",
};

const PARTNERS = [
  {
    name: "OpenAI",
    href: "https://openai.com/",
    src: "logos/openai.svg",
    heightClass: "h-5",
  },
  {
    name: "NEES",
    href: "https://nees.ufal.br/",
    src: "logos/nees.png",
    heightClass: "h-6",
  },
  {
    name: "Ceibal",
    href: "https://www.ceibal.edu.uy/",
    src: "logos/ceibal.svg",
    heightClass: "h-6",
  },
];

function PartnerLogo({
  name,
  href,
  src,
  heightClass,
}: {
  name: string;
  href: string;
  src: string;
  heightClass: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={name}
      className="inline-flex items-center opacity-90 transition-opacity duration-300 hover:opacity-100"
    >
      <img
        src={`${import.meta.env.BASE_URL}${src}`}
        alt={name}
        className={`${heightClass} w-auto object-contain`}
      />
    </a>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)]">
      {children}
    </span>
  );
}

export function TrustStrip() {
  const { t, i18n } = useLingui();
  return (
    <section
      aria-label={t`Supported by`}
      className="relative border-y border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-7">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-3">
            <GroupLabel>
              <Trans>Built with</Trans>
            </GroupLabel>
            <PartnerLogo {...UNICEF} />
          </div>
          <span
            aria-hidden
            className="hidden h-5 w-px bg-[color:var(--color-border)] sm:block"
          />
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            <GroupLabel>
              <Trans>Supported by</Trans>
            </GroupLabel>
            {PARTNERS.map((p) => (
              <PartnerLogo key={p.name} {...p} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
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
      </div>
    </section>
  );
}
