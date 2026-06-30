import { Trans } from "@lingui/react/macro";

type Supporter = {
  name: string;
  href: string;
  src: string;
  heightClass: string;
};

const SUPPORTERS: Supporter[] = [
  {
    name: "UNICEF",
    href: "https://www.unicef.org/",
    src: "logos/unicef.svg",
    heightClass: "h-7",
  },
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

export function SupportersStrip() {
  return (
    <div className="flex flex-col items-center gap-6 border-b border-[color:var(--color-border)] pb-10">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)]">
        <Trans>Made possible by</Trans>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {SUPPORTERS.map((s) => (
          <a
            key={s.name}
            href={s.href}
            target="_blank"
            rel="noreferrer noopener"
            title={s.name}
            className="inline-flex items-center opacity-60 grayscale transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-100 hover:grayscale-0"
          >
            <img
              src={`${import.meta.env.BASE_URL}${s.src}`}
              alt={s.name}
              className={`${s.heightClass} w-auto object-contain`}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
