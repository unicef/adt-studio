import { cn } from "@/lib/utils"

export const PAGE_CARD_INTERACTIVE = cn(
  "cursor-pointer transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none",
  "hover:-translate-y-0.5 hover:border-[var(--chrome-hex)] hover:shadow-[0_0_0_1px_var(--chrome-hex),0_14px_30px_-14px_rgba(15,23,42,0.45)] active:translate-y-0 active:scale-[0.99]",
  "focus-visible:outline-none focus-visible:border-[var(--chrome-hex)] focus-visible:shadow-[0_0_0_1px_var(--chrome-hex),0_0_0_4px_color-mix(in_srgb,var(--chrome-hex)_25%,transparent)]",
)
