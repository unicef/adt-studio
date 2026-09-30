import { cn } from "@/lib/utils"
import { useModifierKey } from "@/hooks/use-platform"

/** Stands in for the platform modifier; Kbd renders it as ⌘ or Ctrl. */
export const MOD_KEY = "mod"

/** Keyboard-shortcut hint, e.g. <Kbd keys={[MOD_KEY, "K"]} />. */
export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  const modifier = useModifierKey()
  return (
    <span className={cn("inline-flex gap-0.5", className)}>
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground"
        >
          {k === MOD_KEY ? modifier : k}
        </kbd>
      ))}
    </span>
  )
}
