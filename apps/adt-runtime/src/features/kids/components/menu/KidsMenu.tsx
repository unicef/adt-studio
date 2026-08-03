import { KidsMenuClassic } from "@/features/kids/components/menu/KidsMenuClassic"
import { KidsMenuShelf } from "@/features/kids/components/menu/KidsMenuShelf"
import type { KidsMenuProps } from "@/features/kids/components/menu/kids-menu-model"
import { useMobileViewport } from "@/features/kids/hooks/useMobileViewport"

/**
 * The interaction model follows the viewport: a compact list on larger
 * screens and a touch-friendly bottom sheet on mobile.
 */
export function KidsMenu(props: KidsMenuProps) {
  const mobile = useMobileViewport()
  return mobile ? <KidsMenuShelf {...props} /> : <KidsMenuClassic {...props} />
}
