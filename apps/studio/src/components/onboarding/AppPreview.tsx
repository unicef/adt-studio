/* eslint-disable lingui/no-unlocalized-strings -- decorative, non-interactive app-preview mock (aria-hidden); copy is localized via Lingui macros below, only the brand name and the ⌘K symbol stay literal */
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
import { Trans, useLingui } from "@lingui/react/macro"
import { OB_LOGO_SRC } from "./theme"

/**
 * Non-interactive mock of the Studio Home — the "here's the real app" preview
 * that rises in behind the welcome. Mirrors the redesigned Home hero. Decorative.
 */
export function AppPreview({ className }: { className?: string }) {
  const { t } = useLingui()

  const nav = [
    { Icon: Home, label: t`Home`, active: true },
    { Icon: Library, label: t`Library`, active: false },
    { Icon: GitFork, label: t`Split & merge`, active: false },
    { Icon: Settings, label: t`Settings`, active: false },
  ]

  const cards = [
    { Icon: FileText, hex: "#2563eb", tint: "#dbeafe", title: t`Extract & filter`, body: t`Pull text, images, and structure from any PDF.` },
    { Icon: Scissors, hex: "#0d9488", tint: "#ccfbf1", title: t`Sectioning`, body: t`Detect chapters, headings and learning units.` },
    { Icon: LayoutGrid, hex: "#7c3aed", tint: "#ede9fe", title: t`Storyboards & captions`, body: t`Accessible image captions and storyboards.` },
    { Icon: SquareCheckBig, hex: "#d97706", tint: "#fef3c7", title: t`Quizzes & glossary`, body: t`Auto-build assessments and key-term lists.` },
  ]

  return (
    <div
      aria-hidden
      className={
        "overflow-hidden rounded-t-2xl border border-b-0 border-[var(--ob-border)] bg-[var(--ob-surface)] text-left shadow-[0_0_46px_-10px_rgba(var(--ob-accent-rgb),0.45)] " +
        (className ?? "")
      }
    >
      {/* window title bar */}
      <div className="flex items-center gap-1.5 border-b border-[var(--ob-border)] bg-[var(--ob-surface-2)] px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>

      <div className="flex">
        {/* sidebar */}
        <aside className="w-[168px] shrink-0 border-r border-[var(--ob-border)] bg-[var(--ob-surface-2)] p-3">
          <div className="mb-3 flex items-center gap-2">
            <img src={OB_LOGO_SRC} alt="" className="h-6 w-6 rounded-[7px]" />
            <div className="leading-tight">
              <div className="text-[10px] font-bold text-[var(--ob-fg)]">ADT Studio</div>
              <div className="text-[6px] font-semibold uppercase tracking-[0.08em] text-[var(--ob-faint)]">
                <Trans>Accessible textbooks</Trans>
              </div>
            </div>
          </div>
          <div className="mb-2.5 flex items-center justify-center gap-1 rounded-lg bg-[var(--ob-accent)] py-1.5 text-[10px] font-semibold text-white">
            <Plus className="h-3 w-3" />
            <Trans>Add book</Trans>
          </div>
          <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-[var(--ob-border)] bg-[var(--ob-surface)] px-2 py-1.5">
            <Search className="h-3 w-3 text-[var(--ob-faint)]" />
            <span className="text-[9px] text-[var(--ob-faint)]">
              <Trans>Search books…</Trans>
            </span>
            <span className="ml-auto rounded bg-[var(--ob-track)] px-1 py-0.5 text-[7px] font-semibold text-[var(--ob-faint)]">
              ⌘K
            </span>
          </div>
          <div className="space-y-0.5">
            {nav.map((n) => (
              <div
                key={n.label}
                className={
                  "flex items-center gap-2 rounded-md px-2 py-1.5 " +
                  (n.active ? "bg-[var(--ob-accent-tint)]" : "")
                }
              >
                <n.Icon
                  className={"h-3.5 w-3.5 " + (n.active ? "text-[var(--ob-accent)]" : "text-[var(--ob-faint)]")}
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
          <div className="text-[15px] font-bold text-[var(--ob-fg)]">
            <Trans>Welcome to ADT Studio</Trans>
          </div>
          <div className="mt-0.5 text-[9.5px] text-[var(--ob-muted)]">
            <Trans>
              Turn any educational PDF into an accessible, interactive learning
              bundle — extracted, captioned, and quiz-ready.
            </Trans>
          </div>

          {/* hero card */}
          <div className="mt-3 flex gap-4 rounded-xl border border-[var(--ob-border)] bg-[var(--ob-surface)] p-3.5 shadow-sm">
            <div className="flex shrink-0 items-center gap-1.5 self-center">
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: "#ffe4e9" }}>
                <FileText className="h-4 w-4" style={{ color: "#e11d48" }} />
              </span>
              <ArrowRight className="h-2.5 w-2.5 text-[var(--ob-faint)]" />
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: "#dbeafe" }}>
                <Sparkles className="h-4 w-4" style={{ color: "#2563eb" }} />
              </span>
              <ArrowRight className="h-2.5 w-2.5 text-[var(--ob-faint)]" />
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: "#d1fae5" }}>
                <Package className="h-4 w-4" style={{ color: "#059669" }} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ob-accent-tint)] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.06em] text-[var(--ob-accent-strong)]">
                <Sparkles className="h-2 w-2" />
                <Trans>New here?</Trans>
              </span>
              <div className="mt-1.5 text-[12px] font-bold leading-snug text-[var(--ob-fg)]">
                <Trans>Add your first book and ADT Studio takes care of the rest.</Trans>
              </div>
              <div className="mt-1 text-[8.5px] leading-relaxed text-[var(--ob-muted)]">
                <Trans>
                  Drop in a textbook PDF and we'll extract pages, generate
                  accessible captions, build storyboards, and assemble quizzes —
                  every step inspectable, every result versioned.
                </Trans>
              </div>
              <div className="mt-2 flex gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--ob-accent)] px-2 py-1 text-[8px] font-semibold text-white">
                  <Plus className="h-2.5 w-2.5" /> <Trans>Add your first book</Trans>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--ob-border-strong)] px-2 py-1 text-[8px] font-semibold text-[var(--ob-fg)]">
                  <Upload className="h-2.5 w-2.5" /> <Trans>Import existing project</Trans>
                </span>
              </div>
            </div>
          </div>

          {/* what it does */}
          <div className="mt-3.5 flex items-baseline">
            <div>
              <div className="text-[10px] font-bold text-[var(--ob-fg)]">
                <Trans>What ADT Studio does</Trans>
              </div>
              <div className="mt-0.5 text-[8px] text-[var(--ob-muted)]">
                <Trans>Each stage runs in your library — fully transparent, easy to rerun.</Trans>
              </div>
            </div>
            <span className="ml-auto text-[8px] font-semibold text-[var(--ob-accent-strong)]">
              <Trans>Read the docs ↗</Trans>
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {cards.map((c) => (
              <div key={c.title} className="rounded-xl border border-black/[0.06] p-2.5">
                <div className="mb-1.5 grid h-6 w-6 place-items-center rounded-lg" style={{ backgroundColor: c.tint }}>
                  <c.Icon className="h-3 w-3" style={{ color: c.hex }} strokeWidth={2.2} />
                </div>
                <div className="text-[8.5px] font-semibold text-[var(--ob-fg)]">{c.title}</div>
                <div className="mt-0.5 text-[7px] leading-snug text-[var(--ob-faint)]">{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
