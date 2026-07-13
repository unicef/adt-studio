import {
  BookMarked,
  Baseline,
  Eye,
  FunctionSquare,
  Hand,
  Languages,
  LayoutTemplate,
  ListChecks,
  MonitorSmartphone,
  Play,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { selectDemo } from "@/data/demos";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/matomo";
import { useInView } from "@/lib/useScrollProgress";

type FeatureSize = "medium" | "compact";

type FeatureItem = {
  key: string;
  title: MessageDescriptor;
  body: MessageDescriptor;
  Icon: LucideIcon;
  tint: string;
  fg: string;
  size: FeatureSize;
  span: string;
  demoKey?: string;
};

const AUDIO_TITLE = msg`Audio narration`;
const AUDIO_BODY = msg`Natural, localized narration for every page, with the read-along text highlighted word by word as it plays.`;

const SIGN_TITLE = msg`Sign language`;
const SIGN_BODY = msg`Chapter-by-chapter sign language video, paired with a sign language glossary, for learners whose first language isn't written text.`;

const FEATURES: FeatureItem[] = [
  {
    key: "translations",
    title: msg`Translations`,
    body: msg`Translate the whole book into every language your classrooms need, then review, edit and re-run before anything ships.`,
    Icon: Languages,
    tint: "bg-blue-50",
    fg: "text-blue-600",
    size: "medium",
    span: "lg:col-span-4",
  },
  {
    key: "structured-layouts",
    title: msg`Structured layouts`,
    body: msg`Headings, paragraphs, tables and figures come out of the PDF as real, navigable HTML, built for screen readers from the first page.`,
    Icon: LayoutTemplate,
    tint: "bg-blue-50",
    fg: "text-blue-600",
    size: "medium",
    span: "lg:col-span-4",
  },
  {
    key: "quizzes",
    title: msg`Quizzes & activities`,
    body: msg`Comprehension questions generated per chapter, plus the book's own exercises rebuilt as interactive, keyboard-accessible activities.`,
    Icon: ListChecks,
    tint: "bg-amber-50",
    fg: "text-amber-600",
    size: "medium",
    span: "lg:col-span-4",
    demoKey: "activities",
  },
  {
    key: "any-device",
    title: msg`Works on any device`,
    body: msg`The same book reflows from desktop to phone, and keeps working offline once it's on the device.`,
    Icon: MonitorSmartphone,
    tint: "bg-amber-50",
    fg: "text-amber-600",
    size: "medium",
    span: "lg:col-span-4",
    demoKey: "responsive",
  },
  {
    key: "easy-read",
    title: msg`Easy-read mode`,
    body: msg`A simplified version of the same text, shorter sentences and common words, offered next to the original.`,
    Icon: Baseline,
    tint: "bg-cyan-50",
    fg: "text-cyan-600",
    size: "compact",
    span: "lg:col-span-2",
    demoKey: "assistant",
  },
  {
    key: "glossary",
    title: msg`Glossary`,
    body: msg`Key terms get pedagogically written definitions in place, with audio and sign language support.`,
    Icon: BookMarked,
    tint: "bg-cyan-50",
    fg: "text-cyan-700",
    size: "compact",
    span: "lg:col-span-2",
  },
  {
    key: "math",
    title: msg`Math that reads aloud`,
    body: msg`Equations convert to real MathML, so screen readers pronounce them correctly instead of skipping past.`,
    Icon: FunctionSquare,
    tint: "bg-rose-50",
    fg: "text-rose-600",
    size: "compact",
    span: "lg:col-span-2",
    demoKey: "math",
  },
  {
    key: "transparent-pipeline",
    title: msg`Transparent pipeline`,
    body: msg`Every instruction sent to the AI and everything it returns is saved to your project folder, in full.`,
    Icon: Eye,
    tint: "bg-[color:var(--color-primary)]/10",
    fg: "text-[color:var(--color-primary)]",
    size: "compact",
    span: "lg:col-span-2",
  },
];

export function FeaturesScene() {
  const { i18n } = useLingui();
  const { ref, inView: mounted } = useInView<HTMLDivElement>({ threshold: 0.2 });
  const reduceMotion = !!useReducedMotion();

  return (
    <section
      id="features"
      className="snap-section relative flex min-h-screen items-center bg-[color:var(--color-background)] py-24 lg:py-32"
    >
      <div ref={ref} className="mx-auto w-full max-w-6xl px-4">
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
              fully-yours accessible book, complete with the pieces that used
              to take a team of specialists.
            </Trans>
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <Reveal
            delay={0.1}
            className="h-full sm:col-span-2 lg:col-span-6"
          >
            <AnchorCard
              title={AUDIO_TITLE}
              body={AUDIO_BODY}
              Icon={Volume2}
              tint="bg-rose-50"
              fg="text-rose-600"
              demoKey="read-aloud"
              reduceMotion={reduceMotion}
            >
              <ReadAloudVignette />
            </AnchorCard>
          </Reveal>

          <Reveal
            delay={0.16}
            className="h-full sm:col-span-2 lg:col-span-6"
          >
            <AnchorCard
              title={SIGN_TITLE}
              body={SIGN_BODY}
              Icon={Hand}
              tint="bg-cyan-50"
              fg="text-cyan-600"
              demoKey="assistant"
              reduceMotion={reduceMotion}
            >
              <AccommodationVignette />
            </AnchorCard>
          </Reveal>

          {FEATURES.map((item, i) => (
            <Reveal
              key={item.key}
              delay={Math.min(0.4, 0.22 + i * 0.04)}
              className={cn("h-full", item.span)}
            >
              <FeatureCard item={item} reduceMotion={reduceMotion} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HoverCard({
  reduceMotion,
  className,
  children,
}: {
  reduceMotion: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={cn(
        "group relative flex rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] transition-colors duration-200 hover:border-[color:var(--color-primary)]/30",
        className,
      )}
      whileHover={
        reduceMotion
          ? undefined
          : { y: -4, boxShadow: "0 18px 40px -20px rgba(0,0,0,0.18)" }
      }
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function WatchDemoButton({
  demoKey,
  title,
  className,
}: {
  demoKey: string;
  title: string;
  className?: string;
}) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      onClick={() => {
        selectDemo(demoKey);
        trackEvent("features", "watch_demo", demoKey);
      }}
      aria-label={t`Watch demo: ${title}`}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[color:var(--color-muted-foreground)] transition-colors duration-200 hover:border-[color:var(--color-primary)]/40 hover:text-[color:var(--color-primary)]",
        className,
      )}
    >
      <Play className="h-3 w-3" fill="currentColor" strokeWidth={0} />
      <Trans>Watch demo</Trans>
    </button>
  );
}

function AnchorCard({
  title,
  body,
  Icon,
  tint,
  fg,
  demoKey,
  reduceMotion,
  children,
}: {
  title: MessageDescriptor;
  body: MessageDescriptor;
  Icon: LucideIcon;
  tint: string;
  fg: string;
  demoKey: string;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const { i18n } = useLingui();
  const titleText = i18n._(title);
  return (
    <HoverCard reduceMotion={reduceMotion} className="h-full">
      <div className="flex h-full w-full flex-col p-7 lg:p-8">
        <span
          className={cn(
            "grid h-12 w-12 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105",
            tint,
            fg,
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={2.2} />
        </span>
        <h3 className="mt-5 text-xl font-semibold tracking-tight text-[color:var(--color-foreground)] md:text-[22px]">
          {titleText}
        </h3>
        <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-[color:var(--color-muted-foreground)] md:text-[15px]">
          {i18n._(body)}
        </p>
        {children}
        <WatchDemoButton demoKey={demoKey} title={titleText} className="mt-auto pt-5" />
      </div>
    </HoverCard>
  );
}

function FeatureCard({
  item,
  reduceMotion,
}: {
  item: FeatureItem;
  reduceMotion: boolean;
}) {
  const { i18n } = useLingui();
  const titleText = i18n._(item.title);
  const isCompact = item.size === "compact";

  return (
    <HoverCard reduceMotion={reduceMotion} className="h-full">
      <div
        className={cn(
          "flex h-full w-full flex-col",
          isCompact ? "p-5" : "p-6",
        )}
      >
        <span
          className={cn(
            "grid place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105",
            isCompact ? "h-9 w-9" : "h-11 w-11",
            item.tint,
            item.fg,
          )}
        >
          <item.Icon
            className={isCompact ? "h-4 w-4" : "h-5 w-5"}
            strokeWidth={2.2}
          />
        </span>
        <h3
          className={cn(
            "font-semibold tracking-tight text-[color:var(--color-foreground)]",
            isCompact ? "mt-3.5 text-sm" : "mt-4 text-base",
          )}
        >
          {titleText}
        </h3>
        <p
          className={cn(
            "leading-relaxed text-[color:var(--color-muted-foreground)]",
            isCompact ? "mt-1.5 text-xs" : "mt-1.5 text-sm",
          )}
        >
          {i18n._(item.body)}
        </p>
        {item.demoKey && (
          <WatchDemoButton
            demoKey={item.demoKey}
            title={titleText}
            className="mt-auto pt-3"
          />
        )}
      </div>
    </HoverCard>
  );
}

const WORD_WIDTHS = [
  "26px",
  "42px",
  "34px",
  "50px",
  "22px",
  "38px",
  "30px",
  "46px",
  "20px",
  "36px",
  "28px",
  "18px",
];

function ReadAloudVignette() {
  return (
    <div
      aria-hidden
      className="mt-5 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 p-4"
    >
      <div className="flex flex-wrap gap-1.5">
        {WORD_WIDTHS.map((width, i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 rounded-sm",
              i === 3 ? "bg-rose-500" : "bg-[color:var(--color-border)]",
            )}
            style={{ width }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-500 text-rose-50">
          <Play className="h-2.5 w-2.5" fill="currentColor" strokeWidth={0} />
        </span>
        <span className="h-1 flex-1 rounded-full bg-[color:var(--color-border)]">
          <span className="block h-full w-2/5 rounded-full bg-rose-500" />
        </span>
        <span className="font-mono text-[10px] text-[color:var(--color-muted-foreground)]">
          0:42
        </span>
      </div>
    </div>
  );
}

function ToggleRow({ label, active }: { label: ReactNode; active?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[color:var(--color-card)] px-3 py-2">
      <span className="text-xs font-semibold text-[color:var(--color-foreground)]">
        {label}
      </span>
      <span
        className={cn(
          "relative h-4 w-7 rounded-full",
          active ? "bg-cyan-500" : "bg-[color:var(--color-border)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-slate-50",
            active ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
    </div>
  );
}

function AccommodationVignette() {
  return (
    <div
      aria-hidden
      className="mt-5 flex flex-col gap-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 p-4"
    >
      <ToggleRow active label={<Trans>Sign language</Trans>} />
      <ToggleRow label={<Trans>Easy read</Trans>} />
      <ToggleRow label={<Trans>Audio narration</Trans>} />
    </div>
  );
}
