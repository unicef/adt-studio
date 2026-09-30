import { useLingui } from "@lingui/react/macro"
import { useQuery } from "@tanstack/react-query"
import type { AvailableRelease } from "@/hooks/use-update-status"
import { cn } from "@/lib/utils"
import { ReleaseFallbackBanner } from "../ReleaseFallbackBanner"
import {
  formatVersion,
  RELEASE_BANNER_ASPECT,
  trustedAssetUrl,
} from "../release-banner-utils"

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
  const coverDarkUrl = trustedAssetUrl(release.coverDarkUrl)
  const alt = release.coverAlt?.trim() || t`Cover for ${title}`
  const coverQuery = useQuery({
    queryKey: ["desktop-updates", "release-cover", coverUrl, coverDarkUrl],
    queryFn: async () => {
      await Promise.all(
        [coverUrl, coverDarkUrl].filter(Boolean).map((url) =>
          loadReleaseCover(url!),
        ),
      )
      return { light: coverUrl!, dark: coverDarkUrl }
    },
    enabled: Boolean(coverUrl),
    retry: false,
    staleTime: Infinity,
  })

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-muted/30",
        RELEASE_BANNER_ASPECT,
        className,
      )}
    >
      {coverQuery.data ? (
        <>
          <img
            src={coverQuery.data.light}
            alt={compact ? "" : alt}
            loading={compact ? "lazy" : "eager"}
            className={cn(
              "size-full object-contain",
              coverQuery.data.dark && "dark:hidden",
            )}
          />
          {coverQuery.data.dark && (
            <img
              src={coverQuery.data.dark}
              alt={compact ? "" : alt}
              loading={compact ? "lazy" : "eager"}
              className="hidden size-full object-contain dark:block"
            />
          )}
        </>
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
