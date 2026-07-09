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
        "bg-white shadow-sm ring-1 ring-slate-200",
        "transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-md active:translate-y-0 active:scale-[0.98]",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:shadow-sm disabled:active:scale-100",
        active && "bg-amber-100 ring-2 ring-amber-400 hover:bg-amber-100",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700",
          active && "bg-amber-200 text-amber-800",
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className={cn(list && "min-w-0 flex-1")}>{label}</span>
      {list && active ? (
        <Check
          className="h-6 w-6 shrink-0 text-amber-700"
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}
