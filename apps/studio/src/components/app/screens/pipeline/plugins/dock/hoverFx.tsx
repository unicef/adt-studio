import { cn } from "@/lib/utils"

export const solidIconClassName = cn(
  "relative text-[var(--icon)] transition-colors duration-200 motion-reduce:transition-none",
  "group-hover/tab:text-white group-focus-visible/tab:text-white group-data-[preview=true]/tab:text-white",
)

const solidHoverClassName = cn(
  "pointer-events-none absolute -inset-px rounded-[10px] bg-[var(--tint)] opacity-0",
  "transition-opacity duration-200 ease-out motion-reduce:transition-none",
  "group-hover/tab:opacity-100 group-focus-visible/tab:opacity-100 group-data-[preview=true]/tab:opacity-100",
)

export function SolidHover() {
  return <span aria-hidden className={solidHoverClassName} />
}
