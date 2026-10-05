import { Sparkles } from "lucide-react"

export interface AiComposerProps {
  placeholder: string
}

export function AiComposer({ placeholder }: AiComposerProps) {
  return (
    <div className="border-t p-3">
      <div className="flex items-center gap-2 rounded-[10px] border bg-card px-3 py-2.5 transition-[border-color,box-shadow] focus-within:border-brand-400 focus-within:shadow-[0_0_0_3px_var(--brand-50)]">
        <Sparkles className="size-3.5 shrink-0 text-brand-600" />
        <input
          type="text"
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}
