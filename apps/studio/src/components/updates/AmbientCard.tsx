import { useLingui } from "@lingui/react/macro"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { ReleaseChannel } from "./release-banner-utils"

interface CardSkin {
  border: string
  shadow: string
  gradient: string
  motif: string
  glow: string
  eyebrow: string
  primaryText: string
  primaryShadow: string
  progressGlow: string
}

export type AmbientCardSkin = ReleaseChannel | "preview" | "previewClosed"

const CARD_SKINS: Record<AmbientCardSkin, CardSkin> = {
  stable: {
    border: "border-[oklch(0.62_0.17_255/0.32)]",
    shadow: "shadow-[0_22px_60px_oklch(0.20_0.06_260/0.5)]",
    gradient:
      "bg-[radial-gradient(circle_at_84%_16%,oklch(0.60_0.21_252/0.9),transparent_42%),radial-gradient(circle_at_16%_94%,oklch(0.42_0.20_264/0.62),transparent_46%),linear-gradient(135deg,oklch(0.23_0.08_257),oklch(0.16_0.05_255)_58%,oklch(0.11_0.03_250))]",
    motif: "text-[oklch(0.70_0.18_253)]",
    glow: "bg-[oklch(0.62_0.24_255/0.5)]",
    eyebrow: "text-[oklch(0.82_0.13_253)]",
    primaryText: "text-[oklch(0.32_0.11_256)]",
    primaryShadow: "shadow-[0_8px_22px_oklch(0.60_0.2_255/0.5)]",
    progressGlow: "shadow-[0_0_12px_oklch(0.92_0.05_255/0.85)]",
  },
  beta: {
    border: "border-[oklch(0.72_0.22_302/0.4)]",
    shadow: "shadow-[0_22px_60px_oklch(0.16_0.08_292/0.5)]",
    gradient:
      "bg-[radial-gradient(circle_at_84%_16%,oklch(0.70_0.28_307/0.82),transparent_42%),radial-gradient(circle_at_16%_94%,oklch(0.46_0.27_286/0.66),transparent_46%),linear-gradient(135deg,oklch(0.30_0.16_293),oklch(0.19_0.10_275)_58%,oklch(0.12_0.05_264))]",
    motif: "text-[oklch(0.78_0.20_306)]",
    glow: "bg-[oklch(0.66_0.28_306/0.5)]",
    eyebrow: "text-[oklch(0.86_0.16_308)]",
    primaryText: "text-[oklch(0.34_0.16_300)]",
    primaryShadow: "shadow-[0_8px_22px_oklch(0.62_0.26_305/0.5)]",
    progressGlow: "shadow-[0_0_12px_oklch(0.90_0.10_305/0.85)]",
  },
  preview: {
    border: "border-[oklch(0.74_0.15_160/0.4)]",
    shadow: "shadow-[0_22px_60px_oklch(0.18_0.06_165/0.5)]",
    gradient:
      "bg-[radial-gradient(circle_at_84%_16%,oklch(0.70_0.16_158/0.82),transparent_42%),radial-gradient(circle_at_16%_94%,oklch(0.46_0.13_175/0.62),transparent_46%),linear-gradient(135deg,oklch(0.32_0.08_165),oklch(0.21_0.06_170)_58%,oklch(0.13_0.03_175))]",
    motif: "text-[oklch(0.82_0.13_160)]",
    glow: "bg-[oklch(0.70_0.17_158/0.5)]",
    eyebrow: "text-[oklch(0.88_0.11_158)]",
    primaryText: "text-[oklch(0.36_0.09_165)]",
    primaryShadow: "shadow-[0_8px_22px_oklch(0.66_0.15_160/0.5)]",
    progressGlow: "shadow-[0_0_12px_oklch(0.93_0.07_160/0.85)]",
  },
  previewClosed: {
    border: "border-[oklch(0.70_0.02_255/0.4)]",
    shadow: "shadow-[0_22px_60px_oklch(0.18_0.01_255/0.5)]",
    gradient:
      "bg-[radial-gradient(circle_at_84%_16%,oklch(0.62_0.03_255/0.7),transparent_42%),radial-gradient(circle_at_16%_94%,oklch(0.42_0.02_260/0.6),transparent_46%),linear-gradient(135deg,oklch(0.32_0.015_255),oklch(0.22_0.01_255)_58%,oklch(0.14_0.005_255))]",
    motif: "text-[oklch(0.80_0.02_255)]",
    glow: "bg-[oklch(0.66_0.03_255/0.45)]",
    eyebrow: "text-[oklch(0.86_0.02_255)]",
    primaryText: "text-[oklch(0.30_0.02_255)]",
    primaryShadow: "shadow-[0_8px_22px_oklch(0.60_0.02_255/0.45)]",
    progressGlow: "shadow-[0_0_12px_oklch(0.92_0.01_255/0.85)]",
  },
}

export interface AmbientCardProps {
  skin: AmbientCardSkin
  icon: ReactNode
  eyebrow: ReactNode
  title: ReactNode
  subtitle: ReactNode
  subtitleLines?: 1 | 2
  progress?: number
  onDismiss?: () => void
  actions: ReactNode
  className?: string
}

export function AmbientCard({
  skin: skinName,
  icon,
  eyebrow,
  title,
  subtitle,
  subtitleLines = 1,
  progress,
  onDismiss,
  actions,
  className,
}: AmbientCardProps) {
  const { t } = useLingui()
  const skin = CARD_SKINS[skinName]

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] justify-end",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-auto relative isolate w-90 overflow-hidden rounded-2xl border text-[oklch(0.98_0.01_255)] duration-500 ease-out animate-in fade-in slide-in-from-bottom-6 motion-reduce:animate-none",
          skin.border,
          skin.shadow,
        )}
      >
        <div
          aria-hidden
          className={cn("absolute inset-0 -z-10", skin.gradient)}
        />
        <div
          aria-hidden
          className={cn(
            "absolute right-3 top-3 h-12 w-32 opacity-30 [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:12px_12px]",
            skin.motif,
          )}
        />
        <div
          aria-hidden
          className={cn(
            "absolute -right-10 -top-12 size-32 animate-[update-card-glow_6s_ease-in-out_infinite] rounded-full blur-2xl motion-reduce:animate-none",
            skin.glow,
          )}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[update-card-shine_5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:hidden"
        />

        <div className="relative z-10 px-5 py-6">
          <div className="flex items-start gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-inner backdrop-blur-sm">
              {icon}
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  "text-[0.62rem] font-semibold uppercase tracking-[0.2em]",
                  skin.eyebrow,
                )}
              >
                {eyebrow}
              </p>
              <p className="mt-1.5 text-base font-semibold leading-tight">
                {title}
              </p>
              <p
                className={cn(
                  "mt-1.5",
                  subtitleLines === 1 ? "truncate" : "line-clamp-2",
                  "text-[0.8rem] text-white/70",
                )}
              >
                {subtitle}
              </p>
            </div>

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label={t`Dismiss`}
                className="-mr-1 -mt-1 rounded-md p-1 text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {progress != null && (
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className={cn(
                  "h-full rounded-full bg-white transition-[width] duration-300 ease-out",
                  skin.progressGlow,
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            {actions}
          </div>
        </div>
      </div>
    </div>
  )
}

export function GlassButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3.5 text-xs font-medium text-white outline-none backdrop-blur-sm transition-all hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
    >
      {children}
    </button>
  )
}

export function PrimaryButton({
  children,
  onClick,
  skin,
}: {
  children: ReactNode
  onClick?: () => void
  skin: AmbientCardSkin
}) {
  const { primaryText: textClass, primaryShadow: glowClass } = CARD_SKINS[skin]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-xs font-semibold outline-none transition-all hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white active:scale-95",
        textClass,
        glowClass,
      )}
    >
      {children}
    </button>
  )
}
