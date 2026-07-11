import { cn } from "@/shared/lib/utils"
import type { BuddyExpression, BuddyImageSet } from "@/features/kids/assets/buddy-images"

interface KidsBuddyImageProps {
  images: BuddyImageSet
  variant?: BuddyExpression
  className?: string
  title?: string
  animate?: boolean
}

export function KidsBuddyImage({
  images,
  variant = "standing",
  className,
  title,
  animate,
}: KidsBuddyImageProps) {
  return (
    <img
      src={images[variant]}
      alt={title ?? ""}
      draggable={false}
      className={cn("object-contain", animate && "kids-buddy-idle", className)}
    />
  )
}
