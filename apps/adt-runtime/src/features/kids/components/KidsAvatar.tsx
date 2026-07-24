import { useMemo, type CSSProperties } from "react"
import type { KidsAvatarConfig } from "@adt/types/kids"
import { kidsAvatarSvg } from "@/features/kids/lib/kids-avatar"
import { cn } from "@/shared/lib/utils"

interface KidsAvatarProps {
  config: KidsAvatarConfig
  /** Pixel size of the (square) avatar. Ignored when `fill` is set. */
  size?: number
  /** Fill the parent element instead of using a fixed pixel size. */
  fill?: boolean
  className?: string
}

/**
 * The child's avatar. Background colour paints the container; the art renders
 * transparent on top. Circular by default; pass `className` (e.g. a
 * `rounded-*`) to reshape, or `fill` to fill the parent as a large portrait.
 */
export function KidsAvatar({
  config,
  size = 96,
  fill = false,
  className,
}: KidsAvatarProps) {
  const html = useMemo(
    () => kidsAvatarSvg(config, { background: false }),
    [config],
  )
  const style: CSSProperties = {
    background: `#${config.backgroundColor || "a5b4fc"}`,
    ...(fill ? {} : { width: size, height: size }),
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "shrink-0 overflow-hidden rounded-full",
        fill ? "block h-full w-full" : "inline-block",
        className,
      )}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
