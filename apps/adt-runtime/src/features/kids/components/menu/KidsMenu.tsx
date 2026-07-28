import { KidsMenuChat } from "@/features/kids/components/menu/KidsMenuChat"
import { KidsMenuClassic } from "@/features/kids/components/menu/KidsMenuClassic"
import { KidsMenuShelf } from "@/features/kids/components/menu/KidsMenuShelf"
import type { KidsMenuProps } from "@/features/kids/components/menu/kids-menu-model"
import type { KidsMenuVariant } from "@/features/kids/components/menu/kids-menu-variant"

interface Props extends KidsMenuProps {
  variant: KidsMenuVariant
}

/**
 * Renders whichever buddy-menu design the preview switch selected. Every
 * variant reads the same `KidsMenuModel`, so they can be compared on an
 * identical set of actions and state.
 */
export function KidsMenu({ variant, ...props }: Props) {
  switch (variant) {
    case "chat":
      return <KidsMenuChat {...props} />
    case "shelf":
      return <KidsMenuShelf {...props} />
    default:
      return <KidsMenuClassic {...props} />
  }
}
