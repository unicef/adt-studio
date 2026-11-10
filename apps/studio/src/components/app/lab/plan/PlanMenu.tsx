import { useLingui } from "@lingui/react/macro"
import { Check, ChevronDown, ChevronRight, CircleDot, Circle, Map, Pause, X } from "lucide-react"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { cn } from "@/lib/utils"
import { PLAN, PLAN_UPDATED, type PlanItem, type PlanStatus } from "./plan"

interface PlanUi {
  open: boolean
  folded: string[]
}

const uiStore = createPersistentStore<PlanUi>(
  "adt.lab.plan",
  { open: false, folded: ["built", "polish", "fixes", "last"] },
  (value): value is PlanUi => typeof value === "object" && value !== null && "open" in value && "folded" in value,
)

const hiddenStore = createPersistentStore<boolean>("adt.lab.toolbar-hidden", false, (value): value is boolean => typeof value === "boolean")

const STATUS_CLASS: Record<PlanStatus, string> = {
  done: "text-emerald-400",
  now: "text-sky-400",
  next: "text-white/45",
  later: "text-white/30",
  paused: "text-amber-300",
}

function StatusIcon({ status }: { status: PlanStatus }) {
  const className = cn("mt-0.5 size-3.5 shrink-0", STATUS_CLASS[status])
  if (status === "done") return <Check aria-hidden className={className} strokeWidth={3} />
  if (status === "now") return <CircleDot aria-hidden className={cn(className, "motion-safe:animate-pulse")} strokeWidth={2.5} />
  if (status === "paused") return <Pause aria-hidden className={className} strokeWidth={2.5} />
  return <Circle aria-hidden className={className} strokeWidth={2} />
}

function Row({ item }: { item: PlanItem }) {
  const { i18n } = useLingui()
  return (
    <li className={cn("flex gap-2 rounded-lg px-2 py-1.5", item.status === "now" && "bg-sky-400/10")}>
      <StatusIcon status={item.status} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-[12.5px] leading-snug", item.status === "done" ? "text-white/55" : item.status === "now" ? "font-semibold text-white" : "text-white/85")}>
          {i18n._(item.label)}
        </span>
        {item.detail && <span className="text-[11px] leading-snug text-white/45">{i18n._(item.detail)}</span>}
      </span>
    </li>
  )
}

export function PlanMenu() {
  const { t, i18n } = useLingui()
  const [ui, setUi] = uiStore.use()
  const [hidden] = hiddenStore.use()
  const all = PLAN.flatMap((section) => section.items)
  const now = all.find((item) => item.status === "now")
  const review = PLAN.find((section) => section.id === "states")?.items ?? []
  const reviewed = review.filter((item) => item.status === "done").length
  if (hidden) return null

  const toggleSection = (id: string) =>
    setUi((current) => ({ ...current, folded: current.folded.includes(id) ? current.folded.filter((key) => key !== id) : [...current.folded, id] }))

  if (!ui.open)
    return (
      <button
        type="button"
        onClick={() => setUi((current) => ({ ...current, open: true }))}
        className={cn(
          "fixed bottom-4 left-4 z-[2147482999] flex max-w-[320px] items-center gap-2 rounded-full bg-zinc-900/92 py-1.5 pr-3.5 pl-2.5 text-[12px] text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md",
          "transition-[transform,background-color] duration-150 hover:bg-zinc-900 active:scale-[0.97] animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none",
        )}
      >
        <Map className="size-3.5 shrink-0 text-sky-300" />
        <span className="font-semibold">{t`Plan`}</span>
        {now && <span className="min-w-0 truncate text-white/65">{t`Now: ${i18n._(now.label)}`}</span>}
      </button>
    )

  return (
    <aside
      aria-label={t`Plan`}
      className={cn(
        "fixed bottom-4 left-4 z-[2147482999] flex max-h-[min(640px,calc(100vh-96px))] w-[340px] flex-col overflow-hidden rounded-2xl bg-zinc-900/95 text-white shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-md",
        "animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none",
      )}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-3.5 py-3">
        <Map className="size-4 text-sky-300" />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[13.5px] font-semibold">{t`Our plan`}</span>
          <span className="text-[11px] text-white/45">{t`States reviewed ${reviewed} of ${review.length} · updated ${PLAN_UPDATED}`}</span>
        </div>
        <button
          type="button"
          aria-label={t`Close the plan`}
          onClick={() => setUi((current) => ({ ...current, open: false }))}
          className="grid size-7 place-items-center rounded-full text-white/60 transition-colors duration-150 hover:bg-white/10 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </header>
      {now && (
        <div className="border-b border-white/10 bg-sky-400/10 px-3.5 py-2.5">
          <span className="text-[10.5px] font-semibold tracking-[0.1em] text-sky-300 uppercase">{t`Up next`}</span>
          <p className="text-[13px] font-semibold">{i18n._(now.label)}</p>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-2">
        {PLAN.map((section) => {
          const folded = ui.folded.includes(section.id)
          const done = section.items.filter((item) => item.status === "done").length
          return (
            <section key={section.id} className="flex flex-col">
              <button
                type="button"
                aria-expanded={!folded}
                onClick={() => toggleSection(section.id)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/5"
              >
                {folded ? <ChevronRight className="size-3.5 text-white/45" /> : <ChevronDown className="size-3.5 text-white/45" />}
                <span className="flex-1 text-[11px] font-semibold tracking-[0.08em] text-white/70 uppercase">{i18n._(section.title)}</span>
                <span className="text-[11px] text-white/40 tabular-nums">{done > 0 ? t`${done}/${section.items.length}` : section.items.length}</span>
              </button>
              {!folded && (
                <div className="animate-in fade-in duration-150 motion-reduce:animate-none">
                  {section.hint && <p className="px-2 pb-1 text-[11px] leading-snug text-white/40">{i18n._(section.hint)}</p>}
                  <ul className="flex flex-col">
                    {section.items.map((item) => (
                      <Row key={item.id} item={item} />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </aside>
  )
}
