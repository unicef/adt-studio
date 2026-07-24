import { useMemo, type CSSProperties } from "react"
import type { KidsAvatarConfig } from "@adt/types/kids"
import { kidsAvatarSvg } from "@/features/kids/lib/kids-avatar"
import { cn } from "@/shared/lib/utils"

interface KidsAvatarProps {
  config: KidsAvatarConfig
  /** Pixel size of the (square) avatar. */
  size?: number
  className?: string
}

/**
 * The child's avatar. Background colour paints the container; the art renders
 * transparent on top so it always fills a clean circle.
 */
export function KidsAvatar({ config, size = 96, className }: KidsAvatarProps) {
  const html = useMemo(
    () => kidsAvatarSvg(config, { background: false }),
    [config],
  )
  const style: CSSProperties = {
    width: size,
    height: size,
    background: `#${config.backgroundColor || "a5b4fc"}`,
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 overflow-hidden rounded-full",
        className,
      )}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
