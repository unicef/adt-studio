import type { ReactNode } from "react"
import type { SetupBookFactId } from "@adt/types"
import { cn } from "@/lib/utils"
import { Illustration } from "../Illustration"

/**
 * Small drawings that explain an idea (the kind of book, tasks that become activities, labelled
 * diagrams) where the user's own pages wouldn't tell the options apart. Decoration only: the words
 * next to them say the same. Drawn on a 320×200 board in the app's colours (light and dark).
 */
function Board({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 320 200" className={cn("h-full w-full", className)} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

/** A sheet of paper with a soft shadow. */
function Sheet({ x, y, w, h, r = 6 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <>
      <rect x={x + 2} y={y + 4} width={w} height={h} rx={r} className="fill-slate-900/10 dark:fill-black/40" />
      <rect x={x} y={y} width={w} height={h} rx={r} className="fill-white stroke-slate-200 dark:fill-zinc-800 dark:stroke-zinc-700" strokeWidth={1} />
    </>
  )
}

/** Lines of text. */
function Lines({ x, y, w, n, gap = 9, short = true }: { x: number; y: number; w: number; n: number; gap?: number; short?: boolean }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x} y={y + i * gap} width={short && i === n - 1 ? w * 0.6 : w} height={3.5} rx={1.75} className="fill-slate-300 dark:fill-zinc-600" />
      ))}
    </>
  )
}

function Story() {
  return (
    <Board>
      {/* An open picture book: a scene on the left, a few lines of the tale on the right. */}
      <path d="M160 44 C130 34 96 34 66 40 L66 164 C96 158 130 158 160 168 Z" className="fill-white stroke-slate-200 dark:fill-zinc-800 dark:stroke-zinc-700" />
      <path d="M160 44 C190 34 224 34 254 40 L254 164 C224 158 190 158 160 168 Z" className="fill-white stroke-slate-200 dark:fill-zinc-800 dark:stroke-zinc-700" />
      <path d="M160 44 L160 168" className="stroke-slate-300 dark:stroke-zinc-600" />
      <circle cx="132" cy="66" r="9" className="fill-amber-300" />
      <path d="M72 140 C92 112 112 112 130 128 C140 118 150 118 156 124 L156 154 C126 150 96 150 72 154 Z" className="fill-emerald-300 dark:fill-emerald-500/70" />
      <circle cx="102" cy="108" r="7" className="fill-brand-500" />
      <path d="M102 115 L102 132 M95 122 L109 122 M102 132 L96 142 M102 132 L108 142" className="stroke-brand-500" strokeWidth={3} />
      <Lines x={172} y={62} w={70} n={3} gap={11} />
      <Lines x={172} y={108} w={70} n={3} gap={11} />
    </Board>
  )
}

function SchoolBook() {
  return (
    <Board>
      <Sheet x={84} y={22} w={152} h={160} />
      <rect x={98} y={36} width={60} height={8} rx={4} className="fill-brand-500" />
      <Lines x={98} y={54} w={124} n={2} />
      {/* Exercise 1: blanks to fill. */}
      <circle cx={103} cy={86} r={6} className="fill-amber-400" />
      <text x={103} y={89} textAnchor="middle" className="fill-white text-[8px] font-bold">1</text>
      <Lines x={114} y={84} w={60} n={1} short={false} />
      <path d="M180 88 L222 88" className="stroke-brand-500" strokeWidth={1.5} strokeDasharray="3 3" />
      <Lines x={98} y={100} w={40} n={1} short={false} />
      <path d="M144 104 L196 104" className="stroke-brand-500" strokeWidth={1.5} strokeDasharray="3 3" />
      {/* Exercise 2: tick the right answer. */}
      <circle cx={103} cy={126} r={6} className="fill-amber-400" />
      <text x={103} y={129} textAnchor="middle" className="fill-white text-[8px] font-bold">2</text>
      <Lines x={114} y={124} w={90} n={1} short={false} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={114} y={136 + i * 13} width={8} height={8} rx={2} className={i === 1 ? "fill-brand-500" : "stroke-slate-300 dark:stroke-zinc-500"} />
          {i === 1 && <path d="M116 140 L118 142 L121 138" className="stroke-white" strokeWidth={1.5} />}
          <Lines x={128} y={138 + i * 13} w={50} n={1} short={false} />
        </g>
      ))}
      {/* A pencil. */}
      <g transform="rotate(-35 250 150)">
        <rect x={236} y={146} width={46} height={9} rx={2} className="fill-amber-300" />
        <path d="M236 146 L226 150.5 L236 155 Z" className="fill-amber-100 dark:fill-amber-200" />
      </g>
    </Board>
  )
}

function Information() {
  return (
    <Board>
      <Sheet x={74} y={22} w={152} h={160} />
      <rect x={88} y={36} width={80} height={7} rx={3.5} className="fill-slate-700 dark:fill-zinc-300" />
      <Lines x={88} y={52} w={124} n={3} />
      {/* A chart and a small table: facts to look up. */}
      {[26, 40, 18, 48].map((h, i) => (
        <rect key={i} x={92 + i * 16} y={130 - h} width={10} height={h} rx={2} className={i === 3 ? "fill-brand-500" : "fill-brand-200 dark:fill-brand-500/40"} />
      ))}
      <path d="M88 132 L160 132" className="stroke-slate-300 dark:stroke-zinc-600" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={170} y={88 + i * 12} width={42} height={7} rx={2} className={i === 0 ? "fill-slate-300 dark:fill-zinc-600" : "fill-slate-100 dark:fill-zinc-700"} />
      ))}
      <Lines x={88} y={146} w={124} n={2} />
      {/* A magnifying glass. */}
      <circle cx={236} cy={136} r={18} className="fill-white/60 stroke-slate-600 dark:fill-zinc-900/60 dark:stroke-zinc-300" strokeWidth={4} />
      <path d="M249 149 L266 166" className="stroke-slate-600 dark:stroke-zinc-300" strokeWidth={6} />
    </Board>
  )
}

/** A printed task on the left, the activity it becomes on screen on the right (or just reading). */
function Exercises({ value }: { value: string }) {
  if (value === "none")
    return (
      <Board>
        <Sheet x={96} y={26} w={128} h={150} />
        <rect x={110} y={40} width={60} height={46} rx={4} className="fill-sky-200 dark:fill-sky-500/40" />
        <circle cx={128} cy={58} r={6} className="fill-amber-300" />
        <Lines x={110} y={98} w={100} n={6} gap={10} />
        <path d="M232 70 C252 70 262 80 262 92" className="stroke-slate-300 dark:stroke-zinc-600" strokeDasharray="3 4" />
        <text x={262} y={110} textAnchor="middle" className="fill-slate-400 text-[11px] font-semibold dark:fill-zinc-500">
          ✕
        </text>
      </Board>
    )
  const many = value === "many"
  return (
    <Board>
      {many && <Sheet x={34} y={34} w={104} h={136} />}
      <Sheet x={26} y={26} w={104} h={136} />
      {(many ? [0, 1, 2] : [0]).map((i) => (
        <g key={i}>
          <circle cx={40} cy={46 + i * 40} r={5.5} className="fill-amber-400" />
          <Lines x={50} y={44 + i * 40} w={66} n={1} short={false} />
          <path d={`M40 ${60 + i * 40} L116 ${60 + i * 40}`} className="stroke-brand-500" strokeWidth={1.5} strokeDasharray="3 3" />
        </g>
      ))}
      {!many && <Lines x={40} y={78} w={76} n={6} gap={10} />}
      {/* Becomes an activity the reader answers on screen. */}
      <path d="M140 100 L168 100 M160 92 L168 100 L160 108" className="stroke-brand-500" strokeWidth={3} />
      <rect x={178} y={38} width={118} height={124} rx={12} className="fill-white stroke-brand-300 dark:fill-zinc-800 dark:stroke-brand-500/60" strokeWidth={1.5} />
      <Lines x={192} y={54} w={88} n={2} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={190} y={78 + i * 18} width={94} height={13} rx={6.5} className={i === 1 ? "fill-brand-100 stroke-brand-500 dark:fill-brand-500/25" : "stroke-slate-200 dark:stroke-zinc-600"} />
          <circle cx={198} cy={84.5 + i * 18} r={3} className={i === 1 ? "fill-brand-500" : "stroke-slate-300 dark:stroke-zinc-500"} />
          <Lines x={206} y={83 + i * 18} w={50} n={1} short={false} />
        </g>
      ))}
      <rect x={250} y={136} width={34} height={14} rx={7} className="fill-brand-500" />
    </Board>
  )
}

/** A labelled diagram kept as one figure with its labels (or, for "none", a plain picture with a caption). */
function Diagrams({ value }: { value: string }) {
  if (value === "none")
    return (
      <Board>
        <Sheet x={92} y={26} w={136} h={150} />
        <rect x={106} y={40} width={108} height={78} rx={4} className="fill-sky-200 dark:fill-sky-500/40" />
        <path d="M106 118 L138 82 L160 104 L178 88 L214 118 Z" className="fill-emerald-400 dark:fill-emerald-500/70" />
        <circle cx={190} cy={58} r={8} className="fill-amber-300" />
        <Lines x={120} y={130} w={80} n={1} short={false} />
        <Lines x={106} y={148} w={108} n={2} />
      </Board>
    )
  const figure = (dx: number, scale: number) => (
    <g transform={`translate(${dx} 0) scale(${scale})`}>
      <rect x={70} y={30} width={180} height={140} rx={10} className="stroke-brand-500" strokeWidth={2} strokeDasharray="6 5" />
      {/* A volcano with its parts labelled. */}
      <path d="M110 150 L150 70 L170 70 L210 150 Z" className="fill-amber-200 dark:fill-amber-500/50" />
      <path d="M150 70 L160 46 L170 70 Z" className="fill-rose-400" />
      <path d="M160 150 L160 74" className="stroke-rose-400" strokeWidth={4} />
      {[
        [158, 50, 92, 46],
        [160, 112, 92, 112],
        [196, 128, 228, 128],
      ].map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <path d={`M${x1} ${y1} L${x2} ${y2}`} className="stroke-slate-500 dark:stroke-zinc-400" strokeWidth={1.2} />
          <circle cx={x1} cy={y1} r={2.5} className="fill-slate-600 dark:fill-zinc-300" />
          <rect x={x2 < x1 ? x2 - 14 : x2} y={y2 - 5} width={26} height={10} rx={3} className="fill-white stroke-slate-300 dark:fill-zinc-800 dark:stroke-zinc-600" />
        </g>
      ))}
    </g>
  )
  return <Board>{value === "many" ? [<g key="a">{figure(-46, 0.72)}</g>, <g key="b">{figure(118, 0.72)}</g>] : figure(0, 1)}</Board>
}

const KIND: Record<string, () => ReactNode> = { story: Story, textbook: SchoolBook, reference: Information }

const IMAGE: Partial<Record<SetupBookFactId, Record<string, string>>> = {
  genre: { story: "kind-story", textbook: "kind-school", reference: "kind-information" },
  exercises: { none: "exercises-none", some: "exercises-some", many: "exercises-many" },
  diagrams: { none: "diagrams-none", some: "diagrams-some", many: "diagrams-many" },
}

/**
 * The picture for a fact's answer: its illustration (public/add-book), with the drawing above as
 * the fallback; null when the book's own pages explain it better (where the words sit).
 */
export function factArt(fact: SetupBookFactId, value: string): ReactNode | null {
  const name = IMAGE[fact]?.[value]
  if (!name) return null
  const Kind = KIND[value]
  const drawing = fact === "genre" ? Kind ? <Kind /> : null : fact === "exercises" ? <Exercises value={value} /> : <Diagrams value={value} />
  return <Illustration name={name} fallback={drawing} />
}

/** The page layouts' illustrations: a printed page becoming the screen, on a tablet and a phone. */
const LAYOUT_IMAGE: Record<string, string> = {
  llm: "layout-ai",
  "llm-overlay": "layout-overlay",
  single_column: "layout-single-column",
  two_column_story: "layout-two-column",
  fixed_layout: "layout-fixed",
}

/** A page layout's illustration (null for a layout without one). */
export function layoutArt(strategy: string): ReactNode | null {
  const name = LAYOUT_IMAGE[strategy]
  return name ? <Illustration name={name} /> : null
}
