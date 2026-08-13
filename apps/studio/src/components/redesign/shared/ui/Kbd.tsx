import { cn } from "@/lib/utils"

/** Keyboard-shortcut hint, e.g. <Kbd keys={["⌘", "K"]} />. */
export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)}>
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}
