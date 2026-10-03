import { Trans, useLingui } from "@lingui/react/macro"
import { CheckCircle2, Download, RotateCw, Sparkles } from "lucide-react"
import type { UpdateStatus } from "@/hooks/use-update-status"
import { formatBytes } from "@/lib/utils"
import { AmbientCard, GlassButton, PrimaryButton } from "./AmbientCard"
import {
  formatVersion,
  getReleaseChannel,
  releaseHeadline,
} from "./release-banner-utils"

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
 * Ambient, non-blocking update nudge anchored bottom-right — a compact cousin of
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
  const percent =
    status.phase === "downloading" ? clampPercent(status.percent) : 0

  return (
    <AmbientCard
      skin={channel}
      className={className}
      icon={
        status.phase === "available" ? (
          <Sparkles className="size-6" />
        ) : status.phase === "downloading" ? (
          <Download className="size-6" />
        ) : (
          <CheckCircle2 className="size-6" />
        )
      }
      eyebrow={
        status.phase === "downloaded" ? (
          <Trans>Ready to install</Trans>
        ) : status.phase === "downloading" ? (
          <Trans>Downloading</Trans>
        ) : beta ? (
          <Trans>Beta {version}</Trans>
        ) : (
          <Trans>Release {version}</Trans>
        )
      }
      title={
        status.phase === "downloading" ? (
          <Trans>Downloading update…</Trans>
        ) : status.phase === "downloaded" ? (
          <Trans>Update ready to install</Trans>
        ) : (
          <Trans>Update available</Trans>
        )
      }
      subtitle={
        status.phase === "downloading"
          ? t`${Math.round(percent)}% · ${formatBytes(status.bytesPerSecond)}/s`
          : subtitleFor(status.releaseNotes, version, status)
      }
      progress={status.phase === "downloading" ? percent : undefined}
      onDismiss={status.phase !== "downloading" ? onDismiss : undefined}
      actions={
        status.phase === "available" ? (
          <>
            <GlassButton onClick={onDetails}>
              <Trans>What's new</Trans>
            </GlassButton>
            <PrimaryButton onClick={onDownload} skin={channel}>
              <Download className="size-4" />
              <Trans>Download</Trans>
            </PrimaryButton>
          </>
        ) : status.phase === "downloading" ? (
          <GlassButton onClick={onCancel}>
            <Trans>Cancel</Trans>
          </GlassButton>
        ) : (
          <>
            <GlassButton onClick={onDetails}>
              <Trans>What's new</Trans>
            </GlassButton>
            <PrimaryButton onClick={onInstallNow} skin={channel}>
              <RotateCw className="size-4" />
              <Trans>Restart</Trans>
            </PrimaryButton>
          </>
        )
      }
    />
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

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent))
}
