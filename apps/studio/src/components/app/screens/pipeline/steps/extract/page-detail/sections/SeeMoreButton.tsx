import type { Ref } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

export const SEE_MORE = cn(
  "flex w-fit items-center gap-1 rounded-md text-[12px] font-semibold transition-colors duration-150 hover:underline",
  "text-[color-mix(in_oklab,var(--chrome-hex)_80%,black)] dark:text-[color-mix(in_oklab,var(--chrome-hex)_70%,white)]",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

export function SeeMoreButton({ count, open, onClick, buttonRef }: { count?: number; open: boolean; onClick: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={buttonRef} type="button" onClick={onClick} aria-haspopup="dialog" aria-expanded={open} className={SEE_MORE}>
      {count != null ? <Trans>See more ({count})</Trans> : <Trans>See more</Trans>}
      <ArrowUpRight className="size-3" />
    </button>
  )
}
