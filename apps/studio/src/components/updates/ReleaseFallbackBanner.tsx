import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import {
  formatVersion,
  getReleaseChannel,
  RELEASE_BANNER_ASPECT,
  type ReleaseChannel,
} from "./release-banner-utils"
import betaIconSrc from "../../assets/update-icons/beta-512x512.png?url"
import stableIconSrc from "../../assets/update-icons/stable-512x512.png?url"

interface ReleaseFallbackBannerProps {
  version: string
  channel?: ReleaseChannel
  compact?: boolean
  className?: string
}

const ICON_SRC: Record<ReleaseChannel, string> = {
  stable: stableIconSrc,
  beta: betaIconSrc,
}

export function ReleaseFallbackBanner({
  version,
  channel = getReleaseChannel(version),
  compact,
  className,
}: ReleaseFallbackBannerProps) {
  const isBeta = channel === "beta"
  const label = formatVersion(version, "v0.0.0")

  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden rounded-lg border",
        RELEASE_BANNER_ASPECT,
        "shadow-[0_18px_50px_oklch(0.22_0.04_260/0.16)]",
        isBeta
          ? "border-[oklch(0.72_0.22_302/0.34)] bg-[oklch(0.26_0.14_298)] text-[oklch(0.98_0.01_300)]"
          : "border-[oklch(0.62_0.17_255/0.24)] bg-[oklch(0.18_0.05_255)] text-[oklch(0.98_0.01_255)]",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0",
          isBeta
            ? "bg-[radial-gradient(circle_at_72%_22%,oklch(0.70_0.28_307/0.72),transparent_34%),radial-gradient(circle_at_68%_86%,oklch(0.44_0.27_285/0.92),transparent_40%),linear-gradient(135deg,oklch(0.30_0.16_291),oklch(0.17_0.09_270)_64%,oklch(0.11_0.04_260))]"
            : "bg-[radial-gradient(circle_at_78%_28%,oklch(0.56_0.22_253/0.82),transparent_36%),radial-gradient(circle_at_64%_84%,oklch(0.36_0.20_258/0.66),transparent_42%),linear-gradient(135deg,oklch(0.15_0.03_255),oklch(0.20_0.07_257)_55%,oklch(0.10_0.03_250))]",
        )}
      />

      <Motifs beta={isBeta} />

      <div
        className={cn(
          "relative z-10 flex h-full items-center justify-between gap-4",
          compact ? "px-4 py-4" : "px-6 py-6 sm:px-8 sm:py-7",
        )}
      >
        <div className="min-w-0 max-w-[63%]">
          <div
            className={cn(
              "font-semibold uppercase tracking-[0.24em]",
              isBeta
                ? "text-[oklch(0.84_0.16_308)]"
                : "text-[oklch(0.72_0.18_253)]",
              compact ? "text-[0.58rem]" : "text-[0.68rem] sm:text-xs",
            )}
          >
            {isBeta ? <Trans>Beta release</Trans> : <Trans>Release</Trans>}{" "}
            <span className="tabular-nums">{label}</span>
          </div>

          <div
            className={cn(
              "mt-2 font-bold leading-[0.95] tracking-normal",
              compact ? "text-xl" : "text-[1.35rem] sm:text-[2.5rem]",
            )}
          >
            {isBeta ? (
              <>
                <div>
                  <Trans>Preview</Trans>
                </div>
                <div>
                  <Trans>Build</Trans>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Trans>Quality</Trans>
                </div>
                <div>
                  <Trans>Improvements</Trans>
                </div>
              </>
            )}
          </div>
        </div>

        <div
          className={cn(
            "relative shrink-0",
            compact ? "h-24 w-24" : "h-24 w-24 sm:h-40 sm:w-40",
          )}
          aria-hidden
        >
          {isBeta ? <BetaObject compact={compact} /> : <StableObject compact={compact} />}
        </div>
      </div>
    </div>
  )
}

function Motifs({ beta }: { beta: boolean }) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "absolute left-6 top-5 h-14 w-44 opacity-40",
          "[background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:14px_14px]",
          beta ? "text-[oklch(0.74_0.19_304)]" : "text-[oklch(0.60_0.22_252)]",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "absolute -bottom-16 -left-16 size-40 rounded-full border",
          beta ? "border-[oklch(0.76_0.20_304/0.24)]" : "border-[oklch(0.62_0.18_252/0.28)]",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "absolute -right-14 -top-20 size-44 rounded-full border",
          beta ? "border-[oklch(0.80_0.17_304/0.22)]" : "border-[oklch(0.66_0.18_252/0.24)]",
        )}
      />
    </>
  )
}

function StableObject({ compact }: { compact?: boolean }) {
  return (
    <>
      <div className="absolute inset-x-2 bottom-0 h-9 rounded-full bg-[oklch(0.13_0.04_255/0.58)] blur-xl" />
      <img
        src={ICON_SRC.stable}
        alt=""
        className={cn(
          "absolute rounded-[28%] object-contain drop-shadow-[0_24px_34px_oklch(0.19_0.12_258/0.58)]",
          compact
            ? "-right-1 top-1 size-24 rotate-6"
            : "-right-1 top-1 size-24 rotate-6 sm:-right-4 sm:-top-3 sm:size-44",
        )}
      />
    </>
  )
}

function BetaObject({ compact }: { compact?: boolean }) {
  return (
    <>
      <div className="absolute inset-x-2 bottom-0 h-9 rounded-full bg-[oklch(0.10_0.04_280/0.62)] blur-xl" />
      <img
        src={ICON_SRC.beta}
        alt=""
        className={cn(
          "absolute rounded-[28%] object-contain drop-shadow-[0_24px_34px_oklch(0.25_0.17_294/0.62)]",
          compact
            ? "-right-1 top-1 size-24 -rotate-6"
            : "-right-1 top-1 size-24 -rotate-6 sm:-right-4 sm:-top-3 sm:size-44",
        )}
      />
    </>
  )
}
