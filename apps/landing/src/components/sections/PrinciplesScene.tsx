import {
  FolderArchive,
  GitBranch,
  Rewind,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import { type MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { cn } from "@/lib/cn";
import { useInView } from "@/lib/useScrollProgress";

type Principle = {
  title: MessageDescriptor;
  body: MessageDescriptor;
  Icon: LucideIcon;
};

const PRINCIPLES: Principle[] = [
  {
    title: msg`One folder per book`,
    body: msg`Everything about a book — sources, prompts, outputs, history — lives in a single directory. Zip it, share it, back it up.`,
    Icon: FolderArchive,
  },
  {
    title: msg`Nothing is overwritten`,
    body: msg`Every edit creates a new version. Roll back any stage, compare outputs, keep a full trail of what changed and why.`,
    Icon: GitBranch,
  },
  {
    title: msg`Rerun what matters`,
    body: msg`Results are cached at the LLM call level. Tweak a prompt and only the affected steps re-run — fast, deterministic, inspectable.`,
    Icon: Rewind,
  },
  {
    title: msg`No black boxes`,
    body: msg`Every prompt, every LLM call, every cost is visible. Audit the whole pipeline or hand it off to the next person with confidence.`,
    Icon: ShieldCheck,
  },
];

export function PrinciplesScene() {
  const { ref, inView: mounted } = useInView<HTMLDivElement>({ threshold: 0.2 });
  const { t, i18n } = useLingui();

  return (
    <section
      id="principles"
      className="snap-section relative flex min-h-screen items-center border-y border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 py-24 lg:py-32"
    >
      <div ref={ref} className="mx-auto w-full max-w-6xl px-4">
        <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[1fr_1.3fr] lg:gap-20">
          <div className="lg:sticky lg:top-28">
            <SectionEyebrow label={t`How we build it`} />
            <h2
              className={cn(
                "mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-[44px]",
                "transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
              )}
              style={{ transitionDelay: "80ms" }}
            >
              <Trans>
                Designed for the people who{" "}
                <span className="text-[color:var(--color-primary)]">
                  do the work
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
                ADT Studio is built for teachers, editors and accessibility
                specialists — not engineers. Every choice in the app follows
                four principles so your work is always safe, transparent and
                under your control.
              </Trans>
            </p>
          </div>

          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <li
                key={i}
                className={cn(
                  "group flex flex-col gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[color:var(--color-primary)]/30 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.12)]",
                  mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
                )}
                style={{ transitionDelay: `${300 + i * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
                    <p.Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--color-muted-foreground)]">
                    {String(i + 1).padStart(2, "0")} / 04
                  </span>
                </div>
                <div>
                  <h3 className="mb-1.5 text-base font-semibold tracking-tight text-[color:var(--color-foreground)]">
                    {i18n._(p.title)}
                  </h3>
                  <p className="text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                    {i18n._(p.body)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
