import { EyeOff } from "lucide-react"

export function MutedLabel({ children, description }: { children: React.ReactNode; description: string }) {
  return (
    <span
      title={description}
      aria-label={description}
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-border bg-background px-1.5 text-[10.5px] font-medium text-foreground animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      <EyeOff aria-hidden className="size-3" />
      {children}
    </span>
  )
}
