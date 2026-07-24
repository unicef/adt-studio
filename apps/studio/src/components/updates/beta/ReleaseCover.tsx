import { useLingui } from "@lingui/react/macro"
import { useQuery } from "@tanstack/react-query"
import type { AvailableRelease } from "@/hooks/use-update-status"
import { cn } from "@/lib/utils"
import { ReleaseFallbackBanner } from "../ReleaseFallbackBanner"
import { formatVersion, trustedAssetUrl } from "../release-banner-utils"

interface ReleaseCoverProps {
  release: AvailableRelease
  className?: string
  compact?: boolean
}

function loadReleaseCover(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(url)
    image.onerror = () => reject(new Error())
    image.src = url
  })
}

export function ReleaseCover({
  release,
  className,
  compact = false,
}: ReleaseCoverProps) {
  const { t } = useLingui()
  const title = release.title ?? formatVersion(release.version)
  const coverUrl = trustedAssetUrl(release.coverUrl)
  const alt = release.coverAlt?.trim() || t`Cover for ${title}`
  const coverQuery = useQuery({
    queryKey: ["desktop-updates", "release-cover", coverUrl],
    queryFn: () => loadReleaseCover(coverUrl!),
    enabled: Boolean(coverUrl),
    retry: false,
    staleTime: Infinity,
  })

  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden rounded-lg border bg-muted",
        className,
      )}
    >
      {coverQuery.data ? (
        <img
          src={coverQuery.data}
          alt={compact ? "" : alt}
          loading={compact ? "lazy" : "eager"}
          className="size-full object-cover"
        />
      ) : (
        <ReleaseFallbackBanner
          version={release.version}
          compact={compact}
          className="absolute inset-0 size-full rounded-none border-0 shadow-none"
        />
      )}
    </div>
  )
}
