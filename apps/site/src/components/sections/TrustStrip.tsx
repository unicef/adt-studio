import { Trans, useLingui } from "@lingui/react/macro";

const UNICEF = {
  name: "UNICEF",
  href: "https://www.unicef.org/",
  src: "logos/unicef.svg",
  heightClass: "h-6 sm:h-7",
};

const PARTNERS = [
  {
    name: "OpenAI",
    href: "https://openai.com/",
    src: "logos/openai.svg",
    heightClass: "h-4 sm:h-5",
  },
  {
    name: "NEES",
    href: "https://nees.ufal.br/",
    src: "logos/nees.png",
    heightClass: "h-5 sm:h-6",
  },
  {
    name: "Ceibal",
    href: "https://www.ceibal.edu.uy/",
    src: "logos/ceibal.svg",
    heightClass: "h-5 sm:h-6",
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
    <span className="whitespace-nowrap text-[10px] font-bold uppercase leading-none tracking-[0.16em] text-[color:var(--color-muted-foreground)]">
      {children}
    </span>
  );
}

export function TrustStrip() {
  const { t } = useLingui();
  return (
    <section
      aria-label={t`Supported by`}
      className="relative border-y border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-5 px-4 py-6 sm:gap-x-8 sm:py-7">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <GroupLabel>
            <Trans>Built with</Trans>
          </GroupLabel>
          <PartnerLogo {...UNICEF} />
        </div>
        <span
          aria-hidden
          className="hidden h-5 w-px bg-[color:var(--color-border)] sm:block"
        />
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:gap-x-7">
          <GroupLabel>
            <Trans>Supported by</Trans>
          </GroupLabel>
          {PARTNERS.map((p) => (
            <PartnerLogo key={p.name} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
