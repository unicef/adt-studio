/* eslint-disable lingui/no-unlocalized-strings -- dev-only report for developers testing the flow, never shown to users (development builds only) */
import { useState, type ReactNode } from "react"
import { useLingui } from "@lingui/react"
import type { SetupRecommendation } from "@adt/types"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { RULE_WHY } from "../engine/words"
import type { SetupFailure } from "../errors/failure"
import type { Answers } from "../guided/shared/useAnswers"
import { explainFacts, explainSettings, type FactWhy, type SettingWhy } from "./explain"
import { ms, num, Pages, Tag } from "./parts"
import { Walkthrough } from "./Walkthrough"

export type ReportInput = {
  rec: SetupRecommendation | null
  chat: Answers
  file: File | null
  failure: SetupFailure | null
  /** What else the user set on the form: the pages, the language they set, the book's name. */
  form: { scope: string; startPage: string; endPage: string; editingLanguage: string; label: string }
  /** Where the flow is (upload, reading, check:<screen>, create:<status>). */
  stage: string
}

/** Everything the report shows, once, for the screen and for the Markdown copy. */
function buildReport({ rec, chat, form, failure, file, stage }: ReportInput, ruleWhy: (rule: string) => string) {
  const d = chat.derived
  const settings: SettingWhy[] = rec && d ? explainSettings(rec, d.current, d.effective, d.fromAnswers, d.source, ruleWhy) : []
  const facts: FactWhy[] = rec ? explainFacts(rec, chat.answers, d?.current ?? null) : []
  const pages = form.scope === "split" ? "split into parts" : form.scope === "range" ? `pages ${form.startPage || 1}–${form.endPage || "end"}` : "all pages"
  const run = rec
    ? {
        model: rec.model,
        pageCount: rec.pageCount,
        bothReadings: rec.secondOpinion,
        errors: rec.readings?.errors,
        timings: rec.timings,
        usage: rec.usage,
        language: rec.language ?? { code: null, source: null },
        pageRange: rec.pageRange,
        sampled: { labels: rec.readings?.labels?.pages.length ?? 0, questions: rec.readings?.questions?.pages ?? [] },
      }
    : null
  return { stage, file: file ? { name: file.name, size: file.size } : null, failure: failure ? { kind: failure.kind, detail: failure.detail } : null, settings, facts, pages, form, run }
}
type Report = ReturnType<typeof buildReport>

function toMarkdown(r: Report): string {
  const o: string[] = ["# Add Book decision report", ""]
  o.push(`- Stage: ${r.stage}`, `- PDF: ${r.file ? `${r.file.name} (${num(r.file.size)} bytes)` : "none"}`)
  if (r.failure) o.push(`- Reading failed: ${r.failure.kind}: ${r.failure.detail}`)
  if (r.run) {
    o.push(`- Model: ${r.run.model}, ${r.run.pageCount} pages; reading A labelled ${r.run.sampled.labels} pages, reading B saw pages ${r.run.sampled.questions.join(", ") || "—"}; both readings: ${r.run.bothReadings ? "yes" : "no"}`)
    if (r.run.errors) o.push(`- Reading errors: ${JSON.stringify(r.run.errors)}`)
    o.push(`- Time ${ms(r.run.timings.totalMs)}, tokens ${num(r.run.usage.inputTokens)} in / ${num(r.run.usage.outputTokens)} out`)
  }
  o.push("", "## Decisions", "")
  for (const s of r.settings) {
    o.push(`### ${s.name}: ${s.final}${s.locked ? " (fixed at creation)" : ""}`)
    o.push(`- Decided by: ${s.decidedBy}${s.final !== s.afterAnswers ? ` (rules gave ${s.afterAnswers})` : ""}${s.afterAnswers !== s.engine ? ` (engine first proposed ${s.engine})` : ""}`)
    o.push(`- Rule: \`${s.rule}\`${s.why ? ` — ${s.why}` : ""}`)
    o.push(`- Based on: ${s.inputs.map((i) => `${i.label} = ${i.value} (${i.from === "fact" ? "fact" : "measured in the PDF"}${i.note ? `; ${i.note}` : ""})`).join("; ")}`)
    o.push(`- Would be different if: ${s.flips.length ? s.flips.map((f) => `${f.fact} were ${f.value} → ${f.result}`).join("; ") : s.noFlip}`)
    if (s.evidence.length) o.push(`- Evidence pages: ${s.evidence.join(", ")}`)
    o.push("")
  }
  o.push("## Facts: how the AI read the book", "")
  for (const f of r.facts) {
    o.push(`### ${f.id}: ${f.used}${f.used !== f.engineGuess ? ` (engine guessed ${f.engineGuess})` : ""}`, `_${f.question}_`)
    if (f.readingA) o.push(`- Reading A (page labels) → ${f.readingA.value}${f.readingA.closeCall ? " (close call)" : ""}: ${f.readingA.lines.join(" ")}`)
    else o.push("- Reading A (page labels): not available")
    if (f.readingB) o.push(`- Reading B (questions) → ${f.readingB.value} (${f.readingB.confidence}), pages ${f.readingB.pages.join(", ") || "—"}: "${f.readingB.reason}"`)
    else o.push("- Reading B (questions): not available")
    o.push(`- Combined: ${f.combined}`, `- Asked: ${f.asked ?? "no"}${f.answer ? `; you answered ${f.answer}` : ""}`, "")
  }
  if (r.run) {
    o.push("## Other choices", "", `- Language: ${r.run.language.code ?? "none"} (from ${r.run.language.source ?? "—"})${r.form.editingLanguage ? `; set by you: ${r.form.editingLanguage}` : ""}`)
    o.push(`- Pages: ${r.pages}${r.run.pageRange ? ` (engine suggested ${r.run.pageRange.start}–${r.run.pageRange.end})` : ""}`, `- Book name: ${r.form.label || "—"}`)
  }
  return o.join("\n")
}

function Card({ title, aside, children, tone }: { title: ReactNode; aside?: ReactNode; children: ReactNode; tone?: "changed" | "plain" }) {
  return (
    <section className={cn("rounded-[14px] p-4 ring-1", tone === "changed" ? "bg-brand-50/50 ring-brand-300" : "ring-border")}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-[14.5px] font-bold">{title}</h4>
        {aside}
      </div>
      <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed">{children}</div>
    </section>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-3 sm:grid-cols-[150px_1fr]">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SettingCard({ s, file }: { s: SettingWhy; file: File | null }) {
  return (
    <Card
      tone={s.decidedBy === "engine (readings + rules)" ? "plain" : "changed"}
      title={
        <>
          {s.name}: <span className="text-brand-700">{s.final}</span>
        </>
      }
      aside={
        <>
          <Tag tone={s.decidedBy.startsWith("engine") ? "plain" : "info"}>{s.decidedBy}</Tag>
          {s.locked && <Tag tone="warn">fixed at creation</Tag>}
        </>
      }
    >
      {(s.final !== s.afterAnswers || s.afterAnswers !== s.engine) && (
        <Line label="History">
          engine proposed <b>{s.engine}</b> → after your answers <b>{s.afterAnswers}</b> → final <b>{s.final}</b>
        </Line>
      )}
      <Line label="Rule">
        <code className="rounded bg-muted px-1 py-0.5 text-[11.5px]">{s.rule}</code> {s.why && <span className="text-muted-foreground">— {s.why}</span>}
      </Line>
      <Line label="Based on">
        <ul className="flex flex-col gap-1">
          {s.inputs.map((i) => (
            <li key={i.label}>
              <Tag tone={i.from === "fact" ? "info" : "plain"}>{i.from === "fact" ? "fact" : "PDF"}</Tag> <b>{i.label}</b> = {i.value}
              {i.note && <span className="text-muted-foreground"> · {i.note}</span>}
            </li>
          ))}
        </ul>
      </Line>
      <Line label="Would be different if (one answer changed)">
        {s.flips.length ? (
          <ul className="flex flex-col gap-0.5">
            {s.flips.map((f) => (
              <li key={`${f.fact}-${f.value}`}>
                <b>{f.fact}</b> were <b>{f.value}</b> → {f.result}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">{s.noFlip}</span>
        )}
      </Line>
      {s.evidence.length > 0 && (
        <Line label="Evidence pages">
          <Pages file={file} pages={s.evidence.slice(0, 8)} width={56} />
        </Line>
      )}
    </Card>
  )
}

function FactCard({ f, file }: { f: FactWhy; file: File | null }) {
  const disagree = f.readingA && f.readingB && f.readingA.value !== f.readingB.value
  return (
    <Card
      tone={f.used !== f.engineGuess ? "changed" : "plain"}
      title={
        <>
          {f.id}: <span className="text-brand-700">{f.used}</span>
        </>
      }
      aside={
        <>
          {f.used !== f.engineGuess && <Tag tone="info">engine guessed {f.engineGuess}</Tag>}
          {disagree && <Tag tone="warn">readings disagree</Tag>}
          {f.readingA?.closeCall && <Tag tone="warn">close call in A</Tag>}
        </>
      }
    >
      <p className="italic text-muted-foreground">{f.question}</p>
      <Line label="Reading A · page labels">
        {f.readingA ? (
          <>
            → <b>{f.readingA.value}</b>. {f.readingA.lines.join(" ")}
          </>
        ) : (
          <span className="text-muted-foreground">not available</span>
        )}
      </Line>
      <Line label="Reading B · questions">
        {f.readingB ? (
          <>
            → <b>{f.readingB.value}</b> <span className="text-muted-foreground">({f.readingB.confidence} confidence)</span>
            <div className="mt-0.5">“{f.readingB.reason}”</div>
          </>
        ) : (
          <span className="text-muted-foreground">not available</span>
        )}
      </Line>
      <Line label="Combined">{f.combined}</Line>
      <Line label="Asked">
        {f.asked ? <>yes: {f.asked}</> : "no"}
        {f.answer && <> · you answered <b>{f.answer}</b></>}
      </Line>
      {(f.readingB?.pages.length || f.evidence.length) > 0 && (
        <Line label="Pages it looked at">
          <Pages file={file} pages={[...new Set([...(f.readingB?.pages ?? []), ...f.evidence])].sort((a, b) => a - b).slice(0, 8)} width={56} />
        </Line>
      )}
    </Card>
  )
}

/**
 * Dev mode's decision report (development builds, on unless `?dev=0`): a button bottom-left that
 * opens a modal explaining why the AI made each decision, to find what caused a wrong pick: each
 * setting with the rule, its inputs and the answers that would flip it; each fact traced from the
 * two readings; the full engine walkthrough; Copy as Markdown / Download JSON.
 */
export default function DecisionReport(input: ReportInput) {
  const { i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const report = buildReport(input, (rule) => (RULE_WHY[rule] ? i18n._(RULE_WHY[rule]!) : ""))
  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(report))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  const download = () => {
    const blob = new Blob([JSON.stringify({ report, answers: input.chat.answers, recommendation: input.rec }, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `add-book-report-${(input.file?.name ?? "no-pdf").replace(/\.pdf$/i, "")}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const r = report
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[60] flex h-9 items-center gap-2 rounded-full bg-neutral-900 px-3.5 text-[12.5px] font-semibold text-white shadow-lg ring-1 ring-white/10 hover:bg-neutral-800"
      >
        <span className={cn("size-2 rounded-full", input.failure ? "bg-red-400" : input.rec ? "bg-emerald-400" : "bg-amber-300")} />
        Decision report
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-none">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4 pr-12">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[16px]">Why the AI decided this</DialogTitle>
              <DialogDescription className="text-[12.5px]">Dev mode · each decision traced to its rule, inputs and readings, live. Hide with ?dev=0.</DialogDescription>
            </div>
            <button type="button" onClick={copy} className="h-8 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-border hover:bg-muted">
              {copied ? "Copied" : "Copy as Markdown"}
            </button>
            <button type="button" onClick={download} className="h-8 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-border hover:bg-muted">
              Download JSON
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
            <div className="mb-4 flex flex-wrap gap-2 text-[12.5px]">
              <Tag tone="info">stage: {r.stage}</Tag>
              {r.file && <Tag>{r.file.name}</Tag>}
              {r.run && <Tag>{r.run.model}</Tag>}
              {r.run && <Tag tone={r.run.bothReadings ? "good" : "warn"}>{r.run.bothReadings ? "both readings" : "one reading only"}</Tag>}
              {r.run && <Tag>A labelled {r.run.sampled.labels} pages · B saw {r.run.sampled.questions.length}</Tag>}
              {r.run && <Tag>{ms(r.run.timings.totalMs)} · {num(r.run.usage.inputTokens)} tokens in</Tag>}
              {r.failure && <Tag tone="bad">failed: {r.failure.kind}</Tag>}
            </div>
            {r.failure && <pre className="mb-4 whitespace-pre-wrap rounded-lg bg-muted p-3 text-[12px]">{r.failure.detail}</pre>}
            {r.run?.errors && <pre className="mb-4 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-[12px] text-amber-900">{JSON.stringify(r.run.errors, null, 2)}</pre>}
            {!input.rec && !input.failure && <p className="py-6 text-[13px] text-muted-foreground">No recommendation yet: drop a PDF and wait for the reading.</p>}
            {r.settings.length > 0 && (
              <>
                <h3 className="mb-2 text-[15px] font-bold">Decisions</h3>
                <div className="grid gap-3 lg:grid-cols-2">
                  {r.settings.map((s) => (
                    <SettingCard key={s.id} s={s} file={input.file} />
                  ))}
                </div>
              </>
            )}
            {r.facts.length > 0 && (
              <>
                <h3 className="mb-2 mt-6 text-[15px] font-bold">Facts: how the AI read the book</h3>
                <div className="grid gap-3 lg:grid-cols-2">
                  {r.facts.map((f) => (
                    <FactCard key={f.id} f={f} file={input.file} />
                  ))}
                </div>
              </>
            )}
            {r.run && (
              <section className="mt-6 grid gap-1 text-[12.5px]">
                <h3 className="mb-1 text-[15px] font-bold">Other choices</h3>
                <Line label="Language">
                  {r.run.language.code ?? "none"} (from {r.run.language.source ?? "—"}){r.form.editingLanguage && `; set by you: ${r.form.editingLanguage}`}
                </Line>
                <Line label="Pages">
                  {r.pages}
                  {r.run.pageRange && ` (engine suggested ${r.run.pageRange.start}–${r.run.pageRange.end})`}
                </Line>
                <Line label="Book name">{r.form.label || "—"}</Line>
              </section>
            )}
            {input.rec && (
              <details className="mt-6">
                <summary className="cursor-pointer text-[15px] font-bold">Full engine walkthrough (every page label, the rulebook)</summary>
                <div className="mt-3">
                  <Walkthrough rec={input.rec} file={input.file} />
                </div>
              </details>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
