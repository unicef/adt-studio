import {
  BookMarked,
  Check,
  Hand,
  Image as ImageIcon,
  Languages,
  Volume2,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import { type MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { cn } from "@/lib/cn";
import { useInView } from "@/lib/useScrollProgress";

const HIGHLIGHTS: { title: MessageDescriptor; body: MessageDescriptor }[] = [
  {
    title: msg`One book, every format`,
    body: msg`HTML, audio, translations and sign-language — exported together as a single package.`,
  },
  {
    title: msg`Read on any device`,
    body: msg`Open in the reader, on the web, or hand the bundle off to an existing LMS.`,
  },
  {
    title: msg`Always editable`,
    body: msg`Your team stays in control. Every asset is a file you can re-run, replace or roll back.`,
  },
];

export function ShowcaseScene() {
  const { ref, inView: mounted } = useInView<HTMLDivElement>({ threshold: 0.2 });
  const { t, i18n } = useLingui();

  return (
    <section
      id="showcase"
      className="snap-section relative flex min-h-screen items-center bg-[color:var(--color-background)] py-24 lg:py-32"
    >
      <div ref={ref} className="mx-auto w-full max-w-6xl px-6 md:px-10">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
          <div>
            <SectionEyebrow label={t`The output`} />
            <h2
              className={cn(
                "mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-[44px]",
                "transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
              )}
              style={{ transitionDelay: "80ms" }}
            >
              <Trans>
                An accessible book,{" "}
                <span className="text-[color:var(--color-primary)]">
                  ready to ship
                </span>
                .
              </Trans>
            </h2>
            <p
              className={cn(
                "mt-5 max-w-md text-base leading-relaxed text-[color:var(--color-muted-foreground)] md:text-[17px]",
                "transition-opacity duration-[600ms]",
                mounted ? "opacity-100" : "opacity-0",
              )}
              style={{ transitionDelay: "220ms" }}
            >
              <Trans>
                When the pipeline finishes, you get a clean bundle with every
                accessibility feature baked in — ready for a classroom, a
                publisher, or a kid on the couch.
              </Trans>
            </p>

            <ul className="mt-8 flex flex-col gap-4">
              {HIGHLIGHTS.map((h, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-3 transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                    mounted
                      ? "translate-y-0 opacity-100"
                      : "translate-y-2 opacity-0",
                  )}
                  style={{ transitionDelay: `${350 + i * 100}ms` }}
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--color-foreground)]">
                      {i18n._(h.title)}
                    </div>
                    <div className="text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                      {i18n._(h.body)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <BookMockup mounted={mounted} />
        </div>
      </div>
    </section>
  );
}

function BookMockup({ mounted }: { mounted: boolean }) {
  return (
    <div className="mx-auto h-[338px] w-full max-w-[338px] overflow-hidden sm:h-[520px] sm:max-w-[520px]">
      <div className="relative h-[520px] w-[520px] origin-top-left scale-[0.65] sm:scale-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 inset-y-4 blur-[2px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(43,127,255,.12), transparent 70%)",
        }}
      />

      <div
        className={cn(
          "absolute left-6 top-10 z-10 h-[400px] w-[280px] overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "rotate-[-4deg]" : "translate-x-3 rotate-[-4deg] opacity-0",
        )}
        style={{
          boxShadow:
            "0 30px 60px -24px rgba(0,0,0,.25), 0 4px 14px rgba(0,0,0,.08)",
          transitionDelay: "250ms",
        }}
      >
        <div className="flex h-[30px] items-center gap-1.5 bg-blue-500 px-3">
          <Check className="h-3 w-3 text-white" />
          <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-white">
            <Trans>Cover · Chapter 1</Trans>
          </span>
        </div>
        <div className="flex h-[calc(100%-30px)] flex-col justify-between p-5">
          <div>
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
              <Trans>Science Textbook</Trans>
            </div>
            <div className="mb-3 h-4 w-4/5 rounded-sm bg-[color:var(--color-foreground)]" />
            <div
              className="relative mb-3 grid aspect-[16/10] place-items-center overflow-hidden rounded-md"
              style={{
                background: "linear-gradient(135deg, #dbeafe, #e0e7ff)",
              }}
            >
              <ImageIcon className="h-8 w-8 text-blue-500" />
              <span className="absolute bottom-1 right-1 rounded-sm bg-teal-50 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide text-teal-600">
                <Trans>Alt</Trans>
              </span>
            </div>
            <div className="mb-1.5 h-1 w-[92%] rounded-sm bg-[color:var(--color-muted)]" />
            <div className="mb-1.5 h-1 w-[86%] rounded-sm bg-[color:var(--color-muted)]" />
            <div className="mb-1.5 h-1 w-[90%] rounded-sm bg-[color:var(--color-muted)]" />
            <div className="h-1 w-[64%] rounded-sm bg-[color:var(--color-muted)]" />
          </div>
          <div className="flex flex-wrap gap-1">
            <Pill tint="bg-rose-50" fg="text-rose-600" Icon={Volume2}>
              <Trans>EN · PT</Trans>
            </Pill>
            <Pill tint="bg-lime-50" fg="text-lime-700" Icon={BookMarked}>
              <Trans>Glossary</Trans>
            </Pill>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "absolute right-4 top-2 z-[15] h-[440px] w-[310px] overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "rotate-[3deg]" : "translate-x-5 rotate-[3deg] opacity-0",
        )}
        style={{
          boxShadow:
            "0 30px 60px -20px rgba(43,127,255,.25), 0 4px 14px rgba(0,0,0,.08)",
          transitionDelay: "400ms",
        }}
      >
        <div className="flex h-[32px] items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)]/60 px-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-[9px] text-[color:var(--color-muted-foreground)]">
            <Trans>science · chapter 3</Trans>
          </span>
          <span className="h-2 w-4 rounded-full bg-[color:var(--color-border)]" />
        </div>
        <div className="px-5 pb-5 pt-4">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-[color:var(--color-primary)]">
            <Trans>Chapter 3</Trans>
          </div>
          <div className="mb-3 h-4 w-5/6 rounded-sm bg-[color:var(--color-foreground)]" />
          <div className="mb-1.5 h-1 w-[94%] rounded-sm bg-[color:var(--color-muted)]" />
          <div className="mb-1.5 h-1 w-[88%] rounded-sm bg-[color:var(--color-muted)]" />
          <div className="mb-3.5 h-1 w-[72%] rounded-sm bg-[color:var(--color-muted)]" />

          <div
            className="relative mb-3 grid aspect-[16/9] place-items-center overflow-hidden rounded-md"
            style={{
              background: "linear-gradient(135deg, #dbeafe, #e0e7ff)",
            }}
          >
            <ImageIcon className="h-7 w-7 text-blue-500" />
            <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-teal-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-teal-600">
              <Trans>Alt described</Trans>
            </span>
          </div>

          <div className="mb-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Volume2 className="h-3 w-3 text-rose-600" />
              <span className="text-[9px] font-bold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                <Trans>Narration · 0:42</Trans>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1 flex-1 rounded-full bg-[color:var(--color-border)]">
                <span className="block h-full w-2/5 rounded-full bg-rose-500" />
              </span>
              <span className="font-mono text-[8px] text-[color:var(--color-muted-foreground)]">
                01:14
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            <Pill tint="bg-rose-50" fg="text-rose-600" Icon={Volume2}>
              <Trans>EN · PT · ES</Trans>
            </Pill>
            <Pill tint="bg-cyan-50" fg="text-cyan-600" Icon={Hand}>
              <Trans>ASL · LIBRAS</Trans>
            </Pill>
            <Pill tint="bg-pink-50" fg="text-pink-600" Icon={Languages}>
              <Trans>4 languages</Trans>
            </Pill>
            <Pill tint="bg-lime-50" fg="text-lime-700" Icon={BookMarked}>
              <Trans>Glossary</Trans>
            </Pill>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function Pill({
  tint,
  fg,
  Icon,
  children,
}: {
  tint: string;
  fg: string;
  Icon: typeof Check;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold",
        tint,
        fg,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {children}
    </span>
  );
}
