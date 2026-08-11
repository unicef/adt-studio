import { Trans, useLingui } from "@lingui/react/macro"
import { CheckCircle2, Download, RotateCw, Sparkles, X } from "lucide-react"
import type { ReactNode } from "react"
import type { UpdateStatus } from "@/hooks/use-update-status"
import { cn, formatBytes } from "@/lib/utils"
import {
  formatVersion,
  getReleaseChannel,
  releaseHeadline,
  type ReleaseChannel,
} from "./release-banner-utils"

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

const CARD_SKINS: Record<ReleaseChannel, CardSkin> = {
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
}

export interface UpdateToastProps {
  status: UpdateStatus
  onDetails?: () => void
  onDownload?: () => void
  onInstallNow?: () => void
  onCancel?: () => void
  onDismiss?: () => void
  className?: string
}

/**
 * Ambient, non-blocking update nudge anchored bottom-left — a compact cousin of
 * the release hero banner. A deep-blue gradient card with an ambient glow, a
 * shine sweep, and glass controls. Reflects the lifecycle in place
 * (available → downloading → downloaded). All motion respects reduced-motion.
 */
export function UpdateToast({
  status,
  onDetails,
  onDownload,
  onInstallNow,
  onCancel,
  onDismiss,
  className,
}: UpdateToastProps) {
  const { t } = useLingui()

  if (
    status.phase !== "available" &&
    status.phase !== "downloading" &&
    status.phase !== "downloaded"
  ) {
    return null
  }

  const version = formatVersion(status.version)
  const channel = getReleaseChannel(status.version)
  const beta = channel === "beta"
  const skin = CARD_SKINS[channel]
  const dismissible = status.phase !== "downloading"
  const percent =
    status.phase === "downloading" ? clampPercent(status.percent) : 0

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)]",
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
              {status.phase === "available" && <Sparkles className="size-6" />}
              {status.phase === "downloading" && (
                <Download className="size-6" />
              )}
              {status.phase === "downloaded" && (
                <CheckCircle2 className="size-6" />
              )}
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  "text-[0.62rem] font-semibold uppercase tracking-[0.2em]",
                  skin.eyebrow,
                )}
              >
                {status.phase === "downloaded" ? (
                  <Trans>Ready to install</Trans>
                ) : status.phase === "downloading" ? (
                  <Trans>Downloading</Trans>
                ) : beta ? (
                  <Trans>Beta {version}</Trans>
                ) : (
                  <Trans>Release {version}</Trans>
                )}
              </p>
              <p className="mt-1.5 text-base font-semibold leading-tight">
                {status.phase === "downloading" ? (
                  <Trans>Downloading update…</Trans>
                ) : status.phase === "downloaded" ? (
                  <Trans>Update ready to install</Trans>
                ) : (
                  <Trans>Update available</Trans>
                )}
              </p>
              <p className="mt-1.5 truncate text-[0.8rem] text-white/70">
                {status.phase === "downloading"
                  ? t`${Math.round(percent)}% · ${formatBytes(status.bytesPerSecond)}/s`
                  : subtitleFor(status.releaseNotes, version, status)}
              </p>
            </div>

            {dismissible && onDismiss && (
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

          {status.phase === "downloading" && (
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className={cn(
                  "h-full rounded-full bg-white transition-[width] duration-300 ease-out",
                  skin.progressGlow,
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            {status.phase === "available" && (
              <>
                <GlassButton onClick={onDetails}>
                  <Trans>What's new</Trans>
                </GlassButton>
                <PrimaryButton
                  onClick={onDownload}
                  textClass={skin.primaryText}
                  glowClass={skin.primaryShadow}
                >
                  <Download className="size-4" />
                  <Trans>Download</Trans>
                </PrimaryButton>
              </>
            )}
            {status.phase === "downloading" && (
              <GlassButton onClick={onCancel}>
                <Trans>Cancel</Trans>
              </GlassButton>
            )}
            {status.phase === "downloaded" && (
              <>
                <GlassButton onClick={onDetails}>
                  <Trans>What's new</Trans>
                </GlassButton>
                <PrimaryButton
                  onClick={onInstallNow}
                  textClass={skin.primaryText}
                  glowClass={skin.primaryShadow}
                >
                  <RotateCw className="size-4" />
                  <Trans>Restart</Trans>
                </PrimaryButton>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function subtitleFor(
  notes: string | undefined,
  version: string,
  status: Extract<UpdateStatus, { phase: "available" | "downloaded" }>,
): string {
  const headline = releaseHeadline(notes)
  if (headline) return headline
  if (status.phase === "available" && status.totalBytes != null) {
    return `${version} · ${formatBytes(status.totalBytes)}`
  }
  return version
}

function GlassButton({
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

function PrimaryButton({
  children,
  onClick,
  textClass,
  glowClass,
}: {
  children: ReactNode
  onClick?: () => void
  textClass: string
  glowClass: string
}) {
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

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent))
}
