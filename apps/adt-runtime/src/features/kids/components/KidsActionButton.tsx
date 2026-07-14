import { Check } from "lucide-react"
import { cn } from "@/shared/lib/utils"

interface KidsActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  testId?: string
  variant?: "grid" | "list"
}

export function KidsActionButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  testId,
  variant = "grid",
}: KidsActionButtonProps) {
  const list = variant === "list"

  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-16 w-full gap-2 rounded-2xl px-3 py-3",
        list
          ? "items-center justify-start text-left"
          : "flex-col items-center justify-center text-center",
        "text-base font-extrabold leading-tight text-slate-900",
        "bg-white shadow-[0_3px_0_#D9EBF8] ring-2 ring-sky-100",
        "transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-[0_4px_0_#D9EBF8] active:translate-y-[2px] active:shadow-[0_1px_0_#D9EBF8]",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:shadow-[0_3px_0_#D9EBF8] disabled:active:translate-y-0 disabled:active:shadow-[0_3px_0_#D9EBF8]",
        active &&
          "bg-[#FFF6D6] ring-2 ring-[#FFC800] shadow-[0_3px_0_#EFC94C] hover:bg-[#FFF6D6] hover:shadow-[0_4px_0_#EFC94C] active:shadow-[0_1px_0_#EFC94C]",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700",
          active && "bg-[#FFE58A] text-[#8A6400]",
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className={cn(list && "min-w-0 flex-1")}>{label}</span>
      {list && active ? (
        <Check
          className="h-6 w-6 shrink-0 text-[#B8860B]"
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}
