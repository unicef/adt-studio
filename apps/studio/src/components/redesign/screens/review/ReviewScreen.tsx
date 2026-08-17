/* eslint-disable lingui/no-unlocalized-strings -- Internal, English-only review report for the team;
 * this route is not part of the shipped product surface and is never localised. */
import { useMemo, useState } from "react"
import { CheckCircle2, GitBranch, Images, Terminal } from "lucide-react"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"
import { FindingCard } from "./FindingCard"
import { SeverityCount } from "./SeverityBadge"
import { REVIEWS, REVIEW_META } from "./data"
import { SEVERITY_ORDER, type Severity } from "./types"

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"
type Filter = Severity | "all"

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...SEVERITY_ORDER.map((s) => ({ value: s as Filter, label: s[0].toUpperCase() + s.slice(1) })),
]

export function ReviewScreen() {
  const [activeId, setActiveId] = useState(REVIEWS[0].id)
  const [filter, setFilter] = useState<Filter>("all")

  const review = REVIEWS.find((r) => r.id === activeId) ?? REVIEWS[0]
  const visible = useMemo(
    () => (filter === "all" ? review.findings : review.findings.filter((f) => f.severity === filter)),
    [review, filter],
  )
  const groups = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const f of visible) map.set(f.category, [...(map.get(f.category) ?? []), f])
    return [...map.entries()]
  }, [visible])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <nav aria-label="Reviews" className="flex w-[268px] shrink-0 flex-col border-r bg-sidebar px-4 py-5">
        <div className="px-2">
          <div className="text-[13px] font-semibold">Redesign review</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">Three passes over the same renders</div>
        </div>

        <ul className="mt-5 flex flex-col gap-1">
          {REVIEWS.map((r) => {
            const active = r.id === review.id
            return (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    setActiveId(r.id)
                    setFilter("all")
                  }}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none",
                    EASE,
                    active ? "bg-brand-50 text-brand-700" : "hover:bg-sidebar-accent",
                  )}
                >
                  <span className="block text-[13px] font-medium">{r.label}</span>
                  <span className="mt-1.5 flex items-center gap-1">
                    {SEVERITY_ORDER.map((s) => (
                      <SeverityCount key={s} severity={s} count={r.findings.filter((f) => f.severity === s).length} />
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <dl className="mt-auto space-y-2.5 px-2 text-[11.5px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <GitBranch className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Branch</dt>
            <dd className="truncate font-mono text-[11px]">{REVIEW_META.branch}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Images className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Renders</dt>
            <dd>{REVIEW_META.shots}</dd>
          </div>
        </dl>
      </nav>

      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[900px] px-[34px] pb-16 pt-10">
          <h1 className="text-2xl font-bold tracking-[-0.02em]">{review.title}</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{review.lead}</p>
          <p className="mt-3 rounded-xl border border-dashed bg-muted/30 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {review.method}
          </p>

          <div className="mt-5">
            <SegmentedControl
              className="w-full max-w-[420px]"
              options={FILTER_OPTIONS}
              value={filter}
              onValueChange={(v) => setFilter(v as Filter)}
            />
          </div>

          {groups.length === 0 ? (
            <p className="mt-8 text-[13px] text-muted-foreground">No {filter} findings in this review.</p>
          ) : (
            groups.map(([category, items]) => (
              <section key={category} className="mt-8">
                <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {category}
                </h2>
                <ul className="flex flex-col gap-3">
                  {items.map((f) => (
                    <FindingCard key={f.id} finding={f} index={review.findings.indexOf(f) + 1} />
                  ))}
                </ul>
              </section>
            ))
          )}

          {review.cleared?.length ? (
            <section className="mt-10">
              <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Checked and cleared
              </h2>
              <ul className="rounded-2xl border bg-card px-[22px] py-1.5 shadow-sm">
                {review.cleared.map((c) => (
                  <li key={c.what} className="flex gap-3 border-t py-[14px] first:border-t-0">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{c.what}</div>
                      <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">{c.why}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {review.toolOutput?.length ? (
            <section className="mt-10">
              <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Command output
              </h2>
              <div className="flex flex-col gap-3">
                {review.toolOutput.map((t) => (
                  <div key={t.command} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                    <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                      <Terminal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <code className="font-mono text-[11.5px]">{t.command}</code>
                    </div>
                    <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                      {t.result}
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {review.verdict?.length ? (
            <section className="mt-10 rounded-2xl border border-brand-300 bg-brand-50 p-5">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-brand-700">Verdict</h2>
              <ol className="mt-2.5 flex flex-col gap-2">
                {review.verdict.map((v, i) => (
                  <li key={v} className="flex gap-2.5 text-[13px] leading-relaxed">
                    <span className="font-mono text-[11.5px] font-semibold text-brand-700">{i + 1}</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
