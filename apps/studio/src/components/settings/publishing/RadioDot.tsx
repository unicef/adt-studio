import { cn } from "@/lib/utils"

export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none",
        selected ? "border-primary" : "border-muted-foreground/40",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full bg-primary transition-transform duration-200 motion-reduce:transition-none",
          selected ? "scale-100" : "scale-0",
        )}
      />
    </span>
  )
}
