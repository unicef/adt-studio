import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppLogo } from "@/hooks/use-app-logo";
import type { OnboardingStepProps } from "../steps";

export function WelcomeScene({ onNext }: OnboardingStepProps) {
  const [mounted, setMounted] = useState(false);
  const logoSrc = useAppLogo();

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-8 p-8 text-center">
      <img
        aria-hidden
        src={logoSrc}
        alt=""
        width={104}
        height={104}
        className={cn(
          "rounded-[22px] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-100 opacity-100" : "scale-[0.85] opacity-0",
        )}
        style={{
          boxShadow:
            "0 24px 60px -18px rgba(43,127,255,.55), 0 2px 8px rgba(0,0,0,.08)",
        }}
      />

      <div
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-opacity duration-500",
          mounted ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDelay: "200ms" }}
      >
        <Trans>Welcome to ADT Studio</Trans>
      </div>

      <h1
        className={cn(
          "max-w-4xl text-5xl font-bold leading-[1.1] tracking-tight transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:text-6xl",
          mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
        style={{ transitionDelay: "300ms" }}
      >
        <Trans>
          Accessibility, from the first{" "}
          <span className="text-primary">page.</span>
        </Trans>
      </h1>

      <p
        className={cn(
          "max-w-lg text-lg leading-relaxed text-muted-foreground transition-opacity duration-[600ms]",
          mounted ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDelay: "600ms" }}
      >
        <Trans>
          Convert any textbook into an accessible digital edition — audio,
          structured layouts, translations, and sign-language, built in from
          the very first page.
        </Trans>
      </p>

      <div
        className={cn(
          "mt-4 transition-opacity duration-500",
          mounted ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDelay: "800ms" }}
      >
        <Button
          size="lg"
          className="h-12 rounded-lg px-8 text-sm"
          onClick={onNext}
        >
          <Trans>Get started</Trans>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
