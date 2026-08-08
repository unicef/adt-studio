import { useEffect, useState } from "react";
import { Volume2, Languages, Hand, LayoutGrid, CornerDownLeft } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { cn } from "@/lib/utils";
import { AppPreview } from "../AppPreview";
import type { OnboardingStepProps } from "../steps";

const PILLS = [
  { key: "audio", Icon: Volume2, className: "text-rose-300 bg-rose-500/10", label: <Trans>Audio</Trans> },
  { key: "translate", Icon: Languages, className: "text-fuchsia-300 bg-fuchsia-500/10", label: <Trans>Translations</Trans> },
  { key: "sign", Icon: Hand, className: "text-cyan-300 bg-cyan-500/10", label: <Trans>Sign language</Trans> },
  { key: "html", Icon: LayoutGrid, className: "text-sky-300 bg-sky-500/10", label: <Trans>Structured HTML</Trans> },
] as const;

export function WelcomeScene({ onNext }: OnboardingStepProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-10 pt-12 text-center">
      <img
        aria-hidden
        src="/logo.png"
        alt=""
        width={56}
        height={56}
        className={cn(
          "rounded-[14px] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-100 opacity-100" : "scale-[0.8] opacity-0",
        )}
        style={{ boxShadow: "0 18px 44px -14px rgba(43,127,255,.6)" }}
      />

      <h1
        className={cn(
          "mt-6 text-[34px] font-semibold leading-tight tracking-tight transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "120ms" }}
      >
        <Trans>Welcome to ADT Studio</Trans>
      </h1>

      <p
        className={cn(
          "mt-3 flex max-w-lg flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-[15px] leading-relaxed text-zinc-400 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "220ms" }}
      >
        <Trans>Turn any textbook into an accessible edition —</Trans>
        {PILLS.map((pill) => (
          <span
            key={pill.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium",
              pill.className,
            )}
          >
            <pill.Icon className="h-3.5 w-3.5" />
            {pill.label}
          </span>
        ))}
      </p>

      <div
        className={cn(
          "mt-7 transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "360ms" }}
      >
        <button
          type="button"
          autoFocus
          onClick={onNext}
          className="group inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 cursor-pointer"
        >
          <Trans>Let's start</Trans>
          <CornerDownLeft className="h-4 w-4 text-zinc-500 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>

      <div
        className={cn(
          "mt-auto w-full max-w-2xl px-2 transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        )}
        style={{ transitionDelay: "520ms" }}
      >
        <AppPreview />
      </div>
    </div>
  );
}
