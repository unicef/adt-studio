import {
  Home,
  Library,
  GitFork,
  Settings,
  Plus,
  FileText,
  Network,
  HelpCircle,
  BookOpen,
} from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

const NAV = [
  { Icon: Home, active: true },
  { Icon: Library, active: false },
  { Icon: GitFork, active: false },
  { Icon: Settings, active: false },
]

const CARDS = [
  { Icon: FileText, hex: "#2563eb", tint: "#eff5ff" },
  { Icon: Network, hex: "#0284c7", tint: "#e8f6fd" },
  { Icon: HelpCircle, hex: "#ea580c", tint: "#fff3ea" },
  { Icon: BookOpen, hex: "#65a30d", tint: "#f2f9e6" },
]

/**
 * Lightweight, non-interactive mock of the Studio Home — the "here's the real
 * app" preview that peeks in behind the welcome. Decorative only.
 */
export function AppPreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "overflow-hidden rounded-t-2xl border border-b-0 border-black/[0.08] bg-white text-left",
        "shadow-[0_-24px_60px_-30px_rgba(59,130,247,0.35)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-black/[0.05] bg-[#fbfbfc] px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="flex">
        <aside className="w-[150px] shrink-0 border-r border-black/[0.05] bg-[#fafafa] p-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-[#3b82f7] text-[10px] font-black text-white">
              A
            </span>
            <span className="text-[11px] font-semibold text-[#0a0a0a]">ADT Studio</span>
          </div>
          <div className="mb-3 flex items-center justify-center gap-1 rounded-lg bg-[#3b82f7] py-1.5 text-[10px] font-semibold text-white">
            <Plus className="h-3 w-3" />
            <Trans>Add book</Trans>
          </div>
          <div className="space-y-1">
            {NAV.map((n, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5",
                  n.active && "bg-[#eef4ff]",
                )}
              >
                <n.Icon
                  className={cn("h-3.5 w-3.5", n.active ? "text-[#3b82f7]" : "text-[#9aa0aa]")}
                  strokeWidth={2.2}
                />
                <span
                  className={cn("h-1.5 rounded-full", n.active ? "bg-[#bcd3ff]" : "bg-[#e6e8ec]")}
                  style={{ width: 52 + ((i * 13) % 30) }}
                />
              </div>
            ))}
          </div>
        </aside>
        <div className="flex-1 p-4">
          <div className="mb-3 h-3 w-40 rounded-full bg-[#eceef1]" />
          <div className="mb-3.5 rounded-xl border border-black/[0.06] bg-[#f7faff] p-3">
            <div className="mb-2 h-2.5 w-28 rounded-full bg-[#cfe0ff]" />
            <div className="h-1.5 w-3/4 rounded-full bg-[#e6e8ec]" />
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {CARDS.map((c, i) => (
              <div key={i} className="rounded-xl border border-black/[0.06] p-2.5">
                <div
                  className="mb-2 grid h-7 w-7 place-items-center rounded-lg"
                  style={{ backgroundColor: c.tint }}
                >
                  <c.Icon className="h-3.5 w-3.5" style={{ color: c.hex }} strokeWidth={2.2} />
                </div>
                <div className="mb-1 h-1.5 w-4/5 rounded-full bg-[#e6e8ec]" />
                <div className="h-1.5 w-3/5 rounded-full bg-[#eef0f3]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
