import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { cn } from "@/lib/utils";

export interface ThinkingShimmerProps {
  /** Loading message shown to the user. */
  children?: ReactNode;
  /** Seconds taken for one shimmer pass. */
  duration?: number;
  className?: string;
}

export function ThinkingShimmer({
  children,
  duration = 1.8,
  className,
}: ThinkingShimmerProps) {
  const { t } = useLingui();

  return (
    <TextShimmer
      as="span"
      duration={duration}
      className={cn("font-medium", className)}
    >
      {children ?? t`Thinking…`}
    </TextShimmer>
  );
}
