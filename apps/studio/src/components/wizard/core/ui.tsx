import type { ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** The one filled action on a screen. Arrow by default; pass `icon` to lead with another one. `pulse` rings once when it becomes ready. */
export function PrimaryButton({ onClick, children, disabled, pulse, icon, className }: { onClick: () => void; children: ReactNode; disabled?: boolean; pulse?: boolean; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand-600 px-6 text-[14.5px] font-semibold text-primary-foreground shadow-[0_8px_22px_rgba(43,127,255,0.35)] transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out hover:bg-brand-600/90 hover:shadow-[0_10px_28px_rgba(43,127,255,0.45)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        pulse && "animate-[flow-cta-ready_0.9s_ease-out_both] motion-reduce:animate-none",
        className,
      )}
    >
      {icon}
      {children}
      {!icon && <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
    </button>
  )
}
