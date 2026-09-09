import { ArrowRight } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { EXTRAS, MODES, type ReaderFeature } from "@/data/features";
import { cn } from "@/lib/cn";
import { withBase } from "@/lib/href";

function FeatureCard({
  feature,
  size,
  index,
}: {
  feature: ReaderFeature;
  size: "lg" | "sm";
  index: number;
}) {
  const { i18n } = useLingui();
  const Icon = feature.icon;
  const Tag = feature.demo ? "a" : "div";
  return (
    <Reveal as="li" delay={index * 0.05} className="flex">
      <Tag
        {...(feature.demo ? { href: withBase(`/#demos`) } : {})}
        className={cn(
          "group flex w-full flex-col rounded-2xl border border-ink-line bg-white transition-[transform,box-shadow,border-color] duration-300 ease-out-quart",
          feature.demo && "hover:-translate-y-0.5 hover:border-ink-faint hover:shadow-card",
          size === "lg" ? "gap-3 p-4 sm:gap-4 sm:p-5" : "gap-3 p-4",
        )}
      >
        <span
          className={cn(
            "grid place-items-center rounded-xl text-white transition-transform duration-300 ease-out-quart group-hover:scale-105",
            size === "lg" ? "size-10 sm:size-12" : "size-10",
          )}
          style={{ backgroundColor: feature.hex }}
        >
          <Icon className={size === "lg" ? "size-5 sm:size-6" : "size-5"} strokeWidth={2} />
        </span>
        <span className="flex flex-1 flex-col gap-1.5">
          <span className={cn("font-display font-extrabold tracking-tight text-ink", size === "lg" ? "text-lg sm:text-xl" : "text-base sm:text-lg")}>
            {i18n._(feature.label)}
          </span>
          <span className="text-[13px] leading-relaxed text-ink-soft sm:text-sm">{i18n._(feature.blurb)}</span>
        </span>
        {feature.demo ? (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-deep opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Trans>Watch</Trans>
            <ArrowRight className="size-3.5" />
          </span>
        ) : null}
      </Tag>
    </Reveal>
  );
}

export function ReaderFeatures() {
  return (
    <section id="features" className="snap-section scroll-mt-[72px] md:scroll-mt-0 flex flex-col justify-center bg-paper py-14">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow={<Trans>What readers get</Trans>}
            title={<Trans>Every book, every learner.</Trans>}
            body={
              <Trans>
                One PDF in, one accessible digital textbook out. Readers switch
                on what they need; nothing is an afterthought bolted on later.
              </Trans>
            }
          />
        </Reveal>
        <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5 [&>li:last-child]:col-span-2 lg:[&>li:last-child]:col-span-1">
          {MODES.map((feature, index) => (
            <FeatureCard key={feature.key} feature={feature} size="lg" index={index} />
          ))}
        </ul>
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {EXTRAS.map((feature, index) => (
            <FeatureCard key={feature.key} feature={feature} size="sm" index={index} />
          ))}
        </ul>
      </div>
    </section>
  );
}
