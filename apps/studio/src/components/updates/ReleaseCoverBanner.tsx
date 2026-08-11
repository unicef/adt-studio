import { useMemo, useState } from "react"
import { useIsDarkTheme } from "@/hooks/use-is-dark-theme"
import { cn } from "@/lib/utils"
import { ReleaseFallbackBanner } from "./ReleaseFallbackBanner"
import {
  parseReleaseCover,
  RELEASE_BANNER_ASPECT,
  type ReleaseChannel,
} from "./release-banner-utils"

export interface ReleaseCoverBannerProps {
  version: string
  notes?: string
  channel?: ReleaseChannel
  className?: string
}

/**
 * Renders the release's own themed cover (light/dark chosen from the active
 * theme). Falls back to the generated {@link ReleaseFallbackBanner} when the
 * release ships no usable cover or the image fails to load.
 */
export function ReleaseCoverBanner({
  version,
  notes,
  channel,
  className,
}: ReleaseCoverBannerProps) {
  const isDark = useIsDarkTheme()
  const cover = useMemo(() => parseReleaseCover(notes), [notes])
  const [failed, setFailed] = useState(false)

  const src = isDark ? (cover.dark ?? cover.light) : (cover.light ?? cover.dark)

  if (!src || failed) {
    return (
      <ReleaseFallbackBanner
        version={version}
        channel={channel}
        className={className}
      />
    )
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        "w-full rounded-lg border bg-muted/30 object-cover transition-opacity",
        RELEASE_BANNER_ASPECT,
        className,
      )}
    />
  )
}
