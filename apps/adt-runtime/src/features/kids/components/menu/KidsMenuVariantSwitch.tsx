import { useAtom } from "jotai"
import { LayoutList, MessageCircle, PanelBottom } from "lucide-react"
import { kidsMenuVariantAtom } from "@/features/kids/state/kids.atoms"
import {
  KIDS_MENU_VARIANTS,
  type KidsMenuVariant,
} from "@/features/kids/components/menu/kids-menu-variant"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import { cn } from "@/shared/lib/utils"

const OPTIONS: Record<
  KidsMenuVariant,
  { label: string; icon: React.ReactNode }
> = {
  classic: { label: "List", icon: <LayoutList className="h-4 w-4" /> },
  chat: { label: "Chat", icon: <MessageCircle className="h-4 w-4" /> },
  shelf: { label: "Shelf", icon: <PanelBottom className="h-4 w-4" /> },
}

/**
 * Team-facing switch for trialling the three buddy-menu designs on the same
 * book. Deliberately styled as a developer control rather than part of the
 * kids interface, and excluded from the child-facing copy/voice pipeline — it
 * comes out once a design is chosen.
 */
export function KidsMenuVariantSwitch() {
  const [variant, setVariant] = useAtom(kidsMenuVariantAtom)
  const reduceMotion = usePrefersReducedMotion()

  return (
    <div
      data-testid="kids-menu-variant-switch"
      role="group"
      aria-label="Buddy menu design (test)"
      className="pointer-events-auto fixed left-3 top-3 z-[62] flex items-center gap-1 rounded-full bg-slate-900/85 p-1 shadow-lg ring-1 ring-white/20 backdrop-blur"
    >
      {KIDS_MENU_VARIANTS.map((id) => {
        const option = OPTIONS[id]
        const active = variant === id
        return (
          <button
            key={id}
            type="button"
            data-testid={`kids-menu-variant-${id}`}
            aria-pressed={active}
            onClick={() => setVariant(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900",
              !reduceMotion && "transition-colors duration-150 ease-out",
              active
                ? "bg-white text-slate-900"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <span aria-hidden="true">{option.icon}</span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
