import { useEffect, useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { BookOpen, List } from "lucide-react"
import { cn } from "@/lib/utils"

const GRADIENT = "bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent"

export type HeadingState = "reading" | "found" | "ask-one" | "ask-many" | "answered"

function Title({ state }: { state: HeadingState }) {
  if (state === "reading")
    return (
      <Trans>
        Reading <span className={GRADIENT}>your book</span>
      </Trans>
    )
  if (state === "ask-one")
    return (
      <Trans>
        One note needs <span className={GRADIENT}>you</span>
      </Trans>
    )
  if (state === "ask-many")
    return (
      <Trans>
        A few notes need <span className={GRADIENT}>you</span>
      </Trans>
    )
  if (state === "answered")
    return (
      <Trans>
        Ready to <span className={GRADIENT}>create</span>
      </Trans>
    )
  return (
    <Trans>
      Here&apos;s what we <span className={GRADIENT}>noticed</span>
    </Trans>
  )
}

function Sub({ state }: { state: HeadingState }) {
  if (state === "reading") return <ReadingPhrase />
  if (state === "ask-one" || state === "ask-many") return <Trans>The AI wasn&apos;t sure about something. Answer on the blue note; the bookmarks follow your answer.</Trans>
  if (state === "answered") return <Trans>Every note is settled. Check the bookmarks, name the book, and create it.</Trans>
  return <Trans>Each note points to the pages that show it. The bookmarks are the settings: open one to change it.</Trans>
}

const PHRASES = [<Trans key="a">Opening it up…</Trans>, <Trans key="b">Reading the pages…</Trans>, <Trans key="c">Writing notes in the margin…</Trans>, <Trans key="d">Putting in the bookmarks…</Trans>]

/** What the AI is doing, one line at a time, slow enough to read. */
function ReadingPhrase() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => Math.min(i + 1, PHRASES.length - 1)), 2600)
    return () => window.clearInterval(id)
  }, [])
  return (
    <span key={index} className="inline-block animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
      {PHRASES[index]}
    </span>
  )
}

/** The stage's title (one word in the brand gradient) and one calm line under it; `aside` sits at the right. */
export function Heading({ state, aside, compact }: { state: HeadingState; aside?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex w-full gap-4", compact ? "flex-col items-center text-center" : "items-end justify-between")}>
      <div className={cn("flex min-w-0 flex-col gap-1.5", compact && "items-center")}>
        <h1 id="open-book-heading" tabIndex={-1} key={state} className={cn("font-bold leading-[1.04] tracking-[-0.035em] outline-none animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none", compact ? "text-[30px] sm:text-[36px]" : "text-[40px]")}>
          <Title state={state} />
        </h1>
        <p className={cn("max-w-[620px] leading-relaxed text-muted-foreground", compact ? "text-[14px]" : "text-[15px]")}>
          <Sub state={state} />
        </p>
      </div>
      {aside}
    </div>
  )
}

/** Book or list: the same notes and bookmarks, with or without the book. */
export function ViewToggle({ view, onView }: { view: "book" | "list"; onView: (v: "book" | "list") => void }) {
  const item = (v: "book" | "list", icon: ReactNode, label: ReactNode) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => onView(v)}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors", view === v ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}
    >
      {icon}
      {label}
    </button>
  )
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-1">
      {item("book", <BookOpen aria-hidden className="size-3.5" />, <Trans>Book</Trans>)}
      {item("list", <List aria-hidden className="size-3.5" />, <Trans>List</Trans>)}
    </div>
  )
}
