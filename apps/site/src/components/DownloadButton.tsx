import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import {
  detectUserPlatform,
  PLATFORMS,
  type DetectedPlatform,
} from "@/components/pages/download/shared";
import { cn } from "@/lib/cn";
import { withBase } from "@/lib/href";
import { trackEvent } from "@/lib/matomo";
import { SPRING_PRESS } from "@/lib/motion";

/**
 * Primary download CTA. Resolves the visitor's platform after hydration and
 * keeps a generic label for the static prerender.
 */
export function DownloadButton({
  source,
  size = "lg",
  className,
}: {
  source: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const { t } = useLingui();
  const [platform, setPlatform] = useState<DetectedPlatform | null>(null);

  useEffect(() => {
    setPlatform(detectUserPlatform());
  }, []);

  const meta = PLATFORMS.find((item) => item.key === platform);
  const label = meta ? t`Download for ${meta.label}` : t`Download for free`;
  const Icon = meta?.icon;

  return (
    <motion.a
      href={withBase("/download")}
      whileTap={{ scale: 0.97 }}
      transition={SPRING_PRESS}
      onClick={() => trackEvent("cta", "download_click", source)}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-full bg-brand font-bold text-white shadow-[0_12px_28px_-12px_oklch(0.546_0.215_262.88/0.7)] transition-[background-color,box-shadow] duration-200 hover:bg-brand-deep hover:shadow-[0_16px_36px_-12px_oklch(0.546_0.215_262.88/0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
        size === "lg" ? "h-14 px-7 text-base" : "h-11 px-5 text-[15px]",
        className,
      )}
    >
      {Icon ? <Icon className="size-[18px]" strokeWidth={2} /> : null}
      {label}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </motion.a>
  );
}
