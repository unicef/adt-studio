/* eslint-disable lingui/no-unlocalized-strings -- decorative, non-interactive app-preview mock (aria-hidden) */
import {
  Home,
  Library,
  GitFork,
  Settings,
  Search,
  Plus,
  Upload,
  Sparkles,
  ArrowRight,
  FileText,
  Scissors,
  LayoutGrid,
  SquareCheckBig,
  Package,
} from "lucide-react"

const NAV = [
  { Icon: Home, label: "Home", active: true },
  { Icon: Library, label: "Library", active: false },
  { Icon: GitFork, label: "Split & merge", active: false },
  { Icon: Settings, label: "Settings", active: false },
]

const CARDS = [
  { Icon: FileText, hex: "#2563eb", tint: "#dbeafe", title: "Extract & filter", body: "Pull text, images, and structure from any PDF." },
  { Icon: Scissors, hex: "#0d9488", tint: "#ccfbf1", title: "Sectioning", body: "Detect chapters, headings and learning units." },
  { Icon: LayoutGrid, hex: "#7c3aed", tint: "#ede9fe", title: "Storyboards & captions", body: "Accessible image captions and storyboards." },
  { Icon: SquareCheckBig, hex: "#d97706", tint: "#fef3c7", title: "Quizzes & glossary", body: "Auto-build assessments and key-term lists." },
]

/**
 * Non-interactive mock of the Studio Home — the "here's the real app" preview
 * that rises in behind the welcome. Mirrors the redesigned Home hero. Decorative.
 */
export function AppPreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={
        "overflow-hidden rounded-t-2xl border border-b-0 border-black/[0.08] bg-white text-left shadow-[0_-24px_60px_-30px_rgba(var(--ob-accent-rgb),0.35)] " +
        (className ?? "")
      }
    >
      {/* window title bar */}
      <div className="flex items-center gap-1.5 border-b border-black/[0.05] bg-[#fbfbfc] px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>

      <div className="flex">
        {/* sidebar */}
        <aside className="w-[168px] shrink-0 border-r border-black/[0.05] bg-[#fafafa] p-3">
          <div className="mb-3 flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-6 w-6 rounded-[7px]" />
            <div className="leading-tight">
              <div className="text-[10px] font-bold text-[#0a0a0a]">ADT Studio</div>
              <div className="text-[6px] font-semibold uppercase tracking-[0.08em] text-[#9aa0aa]">
                Accessible textbooks
              </div>
            </div>
          </div>
          <div className="mb-2.5 flex items-center justify-center gap-1 rounded-lg bg-[var(--ob-accent)] py-1.5 text-[10px] font-semibold text-white">
            <Plus className="h-3 w-3" />
            Add book
          </div>
          <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2 py-1.5">
            <Search className="h-3 w-3 text-[#b3b7be]" />
            <span className="text-[9px] text-[#b3b7be]">Search books…</span>
            <span className="ml-auto rounded bg-[#f1f2f4] px-1 py-0.5 text-[7px] font-semibold text-[#9aa0aa]">
              ⌘K
            </span>
          </div>
          <div className="space-y-0.5">
            {NAV.map((n) => (
              <div
                key={n.label}
                className={
                  "flex items-center gap-2 rounded-md px-2 py-1.5 " +
                  (n.active ? "bg-[var(--ob-accent-tint)]" : "")
                }
              >
                <n.Icon
                  className={"h-3.5 w-3.5 " + (n.active ? "text-[var(--ob-accent)]" : "text-[#9aa0aa]")}
                  strokeWidth={2.2}
                />
                <span className={"text-[10px] " + (n.active ? "font-semibold text-[var(--ob-accent)]" : "text-[#5a5f68]")}>
                  {n.label}
                </span>
              </div>
            ))}
          </div>
        </aside>

        {/* main */}
        <div className="flex-1 p-4">
          <div className="text-[15px] font-bold text-[#0a0a0a]">Welcome to ADT Studio</div>
          <div className="mt-0.5 text-[9.5px] text-[#737373]">
            Turn any educational PDF into an accessible, interactive learning bundle — extracted, captioned, and quiz-ready.
          </div>

          {/* hero card */}
          <div className="mt-3 flex gap-4 rounded-xl border border-black/[0.08] bg-white p-3.5 shadow-sm">
            <div className="flex shrink-0 items-center gap-1.5 self-center">
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: "#ffe4e9" }}>
                <FileText className="h-4 w-4" style={{ color: "#e11d48" }} />
              </span>
              <ArrowRight className="h-2.5 w-2.5 text-[#c2c6cd]" />
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: "#dbeafe" }}>
                <Sparkles className="h-4 w-4" style={{ color: "#2563eb" }} />
              </span>
              <ArrowRight className="h-2.5 w-2.5 text-[#c2c6cd]" />
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: "#d1fae5" }}>
                <Package className="h-4 w-4" style={{ color: "#059669" }} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ob-accent-tint)] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.06em] text-[var(--ob-accent-strong)]">
                <Sparkles className="h-2 w-2" />
                New here?
              </span>
              <div className="mt-1.5 text-[12px] font-bold leading-snug text-[#0a0a0a]">
                Add your first book and ADT Studio takes care of the rest.
              </div>
              <div className="mt-1 text-[8.5px] leading-relaxed text-[#737373]">
                Drop in a textbook PDF and we'll extract pages, generate accessible captions, build storyboards, and assemble quizzes — every step inspectable, every result versioned.
              </div>
              <div className="mt-2 flex gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--ob-accent)] px-2 py-1 text-[8px] font-semibold text-white">
                  <Plus className="h-2.5 w-2.5" /> Add your first book
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.1] px-2 py-1 text-[8px] font-semibold text-[#0a0a0a]">
                  <Upload className="h-2.5 w-2.5" /> Import existing project
                </span>
              </div>
            </div>
          </div>

          {/* what it does */}
          <div className="mt-3.5 flex items-baseline">
            <div>
              <div className="text-[10px] font-bold text-[#0a0a0a]">What ADT Studio does</div>
              <div className="mt-0.5 text-[8px] text-[#737373]">
                Each stage runs in your library — fully transparent, easy to rerun.
              </div>
            </div>
            <span className="ml-auto text-[8px] font-semibold text-[var(--ob-accent-strong)]">Read the docs ↗</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {CARDS.map((c) => (
              <div key={c.title} className="rounded-xl border border-black/[0.06] p-2.5">
                <div className="mb-1.5 grid h-6 w-6 place-items-center rounded-lg" style={{ backgroundColor: c.tint }}>
                  <c.Icon className="h-3 w-3" style={{ color: c.hex }} strokeWidth={2.2} />
                </div>
                <div className="text-[8.5px] font-semibold text-[#0a0a0a]">{c.title}</div>
                <div className="mt-0.5 text-[7px] leading-snug text-[#9aa0aa]">{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
