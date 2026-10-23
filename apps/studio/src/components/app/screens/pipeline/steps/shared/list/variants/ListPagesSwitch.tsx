import { Rows3 } from "lucide-react"

export function ListPagesSwitch({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-foreground underline-offset-4 transition-colors hover:bg-muted hover:underline"
    >
      <Rows3 className="size-3.5" />
      {label}
    </button>
  )
}
