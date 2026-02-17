import { Eye, EyeOff } from "lucide-react"

interface PruneToggleProps {
  pruned: boolean
  onToggle: () => void
  title?: string
}

/**
 * A circular eye/eye-off toggle button for pruning items.
 * Shows a red circle with eye-off when pruned, invisible until row hover when not pruned.
 * Must be inside a `group` container for hover reveal.
 */
export function PruneToggle({ pruned, onToggle, title }: PruneToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title ?? (pruned ? "Include in rendering" : "Exclude from rendering")}
      className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${pruned ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : "text-muted-foreground/0 group-hover:bg-muted group-hover:text-muted-foreground/60 hover:!bg-muted-foreground/15 hover:!text-muted-foreground"}`}
    >
      {pruned ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
    </button>
  )
}
