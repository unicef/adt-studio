import { BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

export function Cover({ src, className }: { src: string | null; className?: string }) {
  return (
    <span className={cn("grid place-items-center overflow-hidden bg-muted", className)}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <BookOpen className="size-6 text-muted-foreground" />}
    </span>
  )
}
