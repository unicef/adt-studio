import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getPipelineStages } from "@/components/pipeline/stage-config";
import type { OnboardingStepProps } from "../steps";

const STAGES = getPipelineStages();

export function FinaleScene({ onFinish, onSkip }: OnboardingStepProps) {
  const { t } = useLingui();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const lastStageDelay = 700 + (STAGES.length - 1) * 70;
  const ctaDelay = lastStageDelay + 200;
  const skipDelay = ctaDelay + 200;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-8 px-10 text-center">
      <span
        className={cn(
          "text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground transition-opacity duration-500",
          mounted ? "opacity-100" : "opacity-0",
        )}
      >
        <Trans>Mission 01</Trans>
      </span>

      <div className="space-y-3">
        <h2
          className={cn(
            "max-w-2xl text-3xl font-semibold leading-[1.1] tracking-tight text-foreground transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] text-balance",
            mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
          style={{ transitionDelay: "120ms" }}
        >
          <Trans>
            Your first ADT{" "}
            <span className="text-primary">starts here.</span>
          </Trans>
        </h2>
        <p
          className={cn(
            "mx-auto max-w-md text-sm leading-relaxed text-muted-foreground transition-opacity duration-[600ms]",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "300ms" }}
        >
          <Trans>
            Drop in a PDF and watch it flow through every stage — from raw
            pages to an accessible reader.
          </Trans>
        </p>
      </div>

      <StageTimeline mounted={mounted} ariaLabel={t`Book creation stages`} />

      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          autoFocus
          onClick={onFinish}
          className={cn(
            "h-12 rounded-lg px-8 text-sm transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
          style={{ transitionDelay: `${ctaDelay}ms` }}
        >
          <Trans>Start with a PDF</Trans>
          <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className={cn(
            "cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground transition-all duration-500 hover:text-foreground",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: `${skipDelay}ms` }}
        >
          <Trans>I'll start later</Trans>
        </button>
      </div>
    </div>
  );
}

function StageTimeline({
  mounted,
  ariaLabel,
}: {
  mounted: boolean;
  ariaLabel: string;
}) {
  return (
    <ol
      aria-label={ariaLabel}
      className="relative flex w-full max-w-4xl items-start justify-between"
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-[15px] right-[15px] top-[15px] h-px origin-left bg-border transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-x-100" : "scale-x-0",
        )}
        style={{ transitionDelay: "500ms" }}
      />

      {STAGES.map((stage, i) => (
        <StageNode
          key={stage.slug}
          stage={stage}
          index={i}
          mounted={mounted}
        />
      ))}
    </ol>
  );
}

function StageNode({
  stage,
  index,
  mounted,
}: {
  stage: (typeof STAGES)[number];
  index: number;
  mounted: boolean;
}) {
  const Icon = stage.icon;
  return (
    <li className="relative flex flex-col items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "relative z-10 grid h-[30px] w-[30px] place-items-center rounded-full border-[1.5px] bg-background transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
        style={{
          transitionDelay: `${600 + index * 70}ms`,
          borderColor: stage.hex,
          color: stage.hex,
        }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </span>
    </li>
  );
}
