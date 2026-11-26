import { Atom, Braces, File, FileCode2, Hash, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const ICONS: Record<string, [LucideIcon, string]> = {
  tsx: [Atom, "text-sky-500"],
  jsx: [Atom, "text-sky-500"],
  ts: [FileCode2, "text-blue-600"],
  js: [FileCode2, "text-yellow-500"],
  css: [Hash, "text-purple-500"],
  json: [Braces, "text-amber-500"],
}

export function FileIcon({ path, className }: { path: string; className?: string }) {
  const [Icon, color] = ICONS[path.split(".").pop() ?? ""] ?? [File, "text-muted-foreground"]
  return <Icon aria-hidden className={cn("size-4 shrink-0", color, className)} />
}
