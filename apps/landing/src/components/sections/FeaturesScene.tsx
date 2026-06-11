import {
  Hand,
  Languages,
  LayoutGrid,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import { type MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { cn } from "@/lib/cn";
import { useInView } from "@/lib/useScrollProgress";

type Feature = {
  title: MessageDescriptor;
  body: MessageDescriptor;
  Icon: LucideIcon;
  tint: string;
  fg: string;
};

const FEATURES: Feature[] = [
  {
    title: msg`Audio narration`,
    body: msg`Generate studio-quality text-to-speech for every page, with speaker control and per-language voices — no recording needed.`,
    Icon: Volume2,
    tint: "bg-rose-50",
    fg: "text-rose-600",
  },
  {
    title: msg`Translations`,
    body: msg`Ship the same book in every language you need. Translate text, captions and alt-text in one pass — review, edit, re-run.`,
    Icon: Languages,
    tint: "bg-pink-50",
    fg: "text-pink-600",
  },
  {
    title: msg`Structured layouts`,
    body: msg`Recover headings, paragraphs, figures, tables and alt-text from the source PDF as real semantic HTML — built for screen readers.`,
    Icon: LayoutGrid,
    tint: "bg-blue-50",
    fg: "text-blue-600",
  },
  {
    title: msg`Sign language`,
    body: msg`Attach sign-language video for ASL, LIBRAS and beyond — aligned to chapters and inspectable alongside the text.`,
    Icon: Hand,
    tint: "bg-cyan-50",
    fg: "text-cyan-600",
  },
];

export function FeaturesScene() {
  const { i18n } = useLingui();
  const { ref, inView: mounted } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <section
      id="features"
      className="snap-section relative flex min-h-screen items-center bg-[color:var(--color-background)] py-24 lg:py-32"
    >
      <div
        ref={ref}
        className="mx-auto w-full max-w-6xl px-4"
      >
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow label={i18n._(msg`What it does`)} />
          <h2
            className={cn(
              "mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl",
              "transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
            style={{ transitionDelay: "80ms" }}
          >
            <Trans>
              Every accessibility feature,{" "}
              <span className="text-[color:var(--color-primary)]">
                built in from page one
              </span>
              .
            </Trans>
          </h2>
          <p
            className={cn(
              "mx-auto mt-4 max-w-xl text-base leading-relaxed text-[color:var(--color-muted-foreground)] md:text-lg",
              "transition-opacity duration-[600ms]",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "220ms" }}
          >
            <Trans>
              ADT Studio takes one PDF and rebuilds it as a fully-editable,
              fully-yours accessible book — with the pieces that used to take
              a team of specialists.
            </Trans>
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title.id}
              className={cn(
                "group relative flex flex-col gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[color:var(--color-primary)]/30 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.12)]",
                mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
              )}
              style={{ transitionDelay: `${300 + i * 100}ms` }}
            >
              <span
                className={cn(
                  "grid h-11 w-11 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105",
                  f.tint,
                  f.fg,
                )}
              >
                <f.Icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <h3 className="mb-1.5 text-base font-semibold tracking-tight text-[color:var(--color-foreground)]">
                  {i18n._(f.title)}
                </h3>
                <p className="text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                  {i18n._(f.body)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
