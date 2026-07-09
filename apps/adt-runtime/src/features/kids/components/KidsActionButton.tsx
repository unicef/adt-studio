import { cn } from "@/shared/lib/utils"

interface KidsActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  testId?: string
}

export function KidsActionButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  testId,
}: KidsActionButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-16 w-full flex-col items-center justify-center gap-2 rounded-2xl px-3 py-3",
        "text-center text-base font-extrabold leading-tight text-slate-900",
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
      <span>{label}</span>
    </button>
  )
}
