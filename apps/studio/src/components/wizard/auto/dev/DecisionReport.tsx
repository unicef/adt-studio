/* eslint-disable lingui/no-unlocalized-strings -- dev-only report for developers testing the flow, never shown to users (development builds only) */
import { useState, type ReactNode } from "react"
import { useLingui } from "@lingui/react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { FACT_IDS, SETTING_IDS } from "../engine/ids"
import { RULE_WHY } from "../engine/words"
import type { SetupFailure } from "../errors/failure"
import type { Answers } from "../guided/shared/useAnswers"
import { ms, num, Tag, WIZARD_NAME, wizardValue } from "./parts"
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

type FactRow = { id: string; guess: string; other: string; confidence: string; reason: string; asked: string; answer: string; used: string; evidence: string }
type SettingRow = { id: string; name: string; engine: string; rule: string; why: string; fromAnswers: string; final: string; source: string; locked: boolean }

/** Everything the report shows, once, for the tables and for the Markdown copy. */
function buildReport({ rec, chat, form, failure, file, stage }: ReportInput, ruleWhy: (rule: string) => string) {
  const d = chat.derived
  const facts: FactRow[] = rec
    ? FACT_IDS.map((id) => {
        const f = rec.facts.find((x) => x.id === id)
        const q = rec.readings?.questions?.answers?.[id]
        return {
          id,
          guess: f?.value ?? "—",
          other: f?.secondOpinion ?? "—",
          confidence: q?.confidence ?? "—",
          reason: f?.reason ?? q?.reason ?? "",
          asked: f?.ask ? (f.askReason ?? "yes") : "no",
          answer: chat.answers[id as keyof typeof chat.answers] ?? "—",
          used: d ? d.current[id as keyof typeof d.current] : "—",
          evidence: (f?.evidencePages ?? []).join(", "),
        }
      })
    : []
  const settings: SettingRow[] = rec
    ? SETTING_IDS.map((id: SetupSettingId) => {
        const engine = rec.settings[id]
        return {
          id,
          name: WIZARD_NAME[id] ?? id,
          engine: wizardValue(id, engine?.value),
          rule: engine?.rule ?? "—",
          why: engine?.rule ? ruleWhy(engine.rule) : "",
          fromAnswers: d ? wizardValue(id, d.fromAnswers[id]?.value) : "—",
          final: d ? wizardValue(id, d.effective[id]?.value) : "—",
          source: d ? { ai: "engine", asked: "your answers", changed: "changed by hand" }[d.source(id)] : "—",
          locked: rec.lockedSettings.includes(id),
        }
      })
    : []
  const pages = form.scope === "split" ? "split into parts" : form.scope === "range" ? `pages ${form.startPage || 1}–${form.endPage || "end"}` : "all pages"
  const run = rec
    ? {
        model: rec.model,
        engine: rec.engine,
        pageCount: rec.pageCount,
        bothReadings: rec.secondOpinion,
        errors: rec.readings?.errors,
        timings: rec.timings,
        usage: rec.usage,
        language: rec.language ?? { code: null, source: null },
        pageRange: rec.pageRange,
      }
    : null
  return { stage, file: file ? { name: file.name, size: file.size } : null, failure: failure ? { kind: failure.kind, detail: failure.detail } : null, facts, settings, pages, form, run }
}
type Report = ReturnType<typeof buildReport>

function toMarkdown(r: Report): string {
  const row = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`
  const out: string[] = ["# Add Book decision report", ""]
  out.push(`- Stage: ${r.stage}`, `- PDF: ${r.file ? `${r.file.name} (${num(r.file.size)} bytes)` : "none"}`)
  if (r.failure) out.push(`- Reading failed: ${r.failure.kind}: ${r.failure.detail}`)
  if (r.run) {
    out.push(`- Model: ${r.run.model} (engine ${r.run.engine}), ${r.run.pageCount} pages, both readings: ${r.run.bothReadings ? "yes" : "no"}`)
    if (r.run.errors) out.push(`- Reading errors: ${JSON.stringify(r.run.errors)}`)
    out.push(`- Time: total ${ms(r.run.timings.totalMs)} (profile ${ms(r.run.timings.profileMs)}, labels ${ms(r.run.timings.labelsMs)}, questions ${ms(r.run.timings.questionsMs)})`)
    out.push(`- Tokens: ${num(r.run.usage.inputTokens)} in / ${num(r.run.usage.outputTokens)} out, ${r.run.usage.calls} calls`)
    out.push(`- Language: ${r.run.language.code ?? "none"} (from ${r.run.language.source ?? "—"}); set by user: ${r.form.editingLanguage || "—"}`)
    out.push(`- Pages: ${r.pages}${r.run.pageRange ? ` (engine suggested ${r.run.pageRange.start}–${r.run.pageRange.end})` : ""}`)
  }
  out.push(`- Book name: ${r.form.label || "—"}`, "", "## Facts", "", row(["Fact", "Engine guess", "Other reading", "Confidence", "Asked", "Your answer", "Used", "Evidence pages", "Reason"]), row(Array(9).fill("---")))
  for (const f of r.facts) out.push(row([f.id, f.guess, f.other, f.confidence, f.asked, f.answer, f.used, f.evidence, f.reason]))
  out.push("", "## Settings", "", row(["Setting", "Engine", "Rule", "After your answers", "Final", "Decided by", "Locked at creation"]), row(Array(7).fill("---")))
  for (const s of r.settings) out.push(row([s.name, s.engine, `${s.rule}${s.why ? ` — ${s.why}` : ""}`, s.fromAnswers, s.final, s.source, s.locked ? "yes" : "no"]))
  return out.join("\n")
}

function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap border-b border-border px-2 py-1.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</th>
}
function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-b border-border/60 px-2 py-1.5 align-top text-[12.5px]", className)}>{children}</td>
}

/** The live part: what the engine proposed for each decision, what the user answered or changed, and what is used now. */
function LiveDecisions({ r }: { r: Report }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-[12.5px]">
        <Tag tone="info">stage: {r.stage}</Tag>
        {r.file && <Tag>{r.file.name}</Tag>}
        {r.run && <Tag>{r.run.model}</Tag>}
        {r.run && <Tag tone={r.run.bothReadings ? "good" : "warn"}>{r.run.bothReadings ? "both readings" : "one reading only"}</Tag>}
        {r.run && <Tag>{ms(r.run.timings.totalMs)} · {num(r.run.usage.inputTokens)} tokens in</Tag>}
        {r.failure && <Tag tone="bad">failed: {r.failure.kind}</Tag>}
      </div>
      {r.failure && <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-[12px]">{r.failure.detail}</pre>}
      {r.run?.errors && <pre className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-[12px] text-amber-900">{JSON.stringify(r.run.errors, null, 2)}</pre>}
      {r.facts.length > 0 && (
        <section>
          <h3 className="mb-1 text-[14px] font-bold">Facts (what the book is)</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr><Th>Fact</Th><Th>Engine guess</Th><Th>Other reading</Th><Th>Asked</Th><Th>Your answer</Th><Th>Used</Th><Th>Evidence</Th></tr>
              </thead>
              <tbody>
                {r.facts.map((f) => (
                  <tr key={f.id}>
                    <Td className="font-semibold">{f.id}</Td>
                    <Td>{f.guess}</Td>
                    <Td>
                      <span className={cn(f.other !== "—" && f.other !== f.guess && "font-semibold text-amber-700")}>{f.other}</span>
                      {f.confidence !== "—" && <span className="text-muted-foreground"> ({f.confidence})</span>}
                      {f.reason && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{f.reason}</div>}
                    </Td>
                    <Td>{f.asked === "no" ? <span className="text-muted-foreground">no</span> : <Tag tone="warn">{f.asked}</Tag>}</Td>
                    <Td>{f.answer}</Td>
                    <Td className={cn("font-semibold", f.used !== f.guess && "text-brand-700")}>{f.used}</Td>
                    <Td className="tabular-nums text-muted-foreground">{f.evidence}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {r.settings.length > 0 && (
        <section>
          <h3 className="mb-1 text-[14px] font-bold">Settings (what the book is set up with)</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr><Th>Setting</Th><Th>Engine</Th><Th>Rule</Th><Th>After your answers</Th><Th>Final</Th><Th>Decided by</Th></tr>
              </thead>
              <tbody>
                {r.settings.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-semibold">
                      {s.name}
                      {s.locked && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(locked at creation)</span>}
                    </Td>
                    <Td>{s.engine}</Td>
                    <Td>
                      <code className="text-[11.5px]">{s.rule}</code>
                      {s.why && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{s.why}</div>}
                    </Td>
                    <Td>{s.fromAnswers}</Td>
                    <Td className={cn("font-semibold", s.final !== s.engine && "text-brand-700")}>{s.final}</Td>
                    <Td>{s.source === "engine" ? <span className="text-muted-foreground">engine</span> : <Tag tone="info">{s.source}</Tag>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {r.run && (
        <section className="grid gap-1 text-[12.5px]">
          <h3 className="mb-1 text-[14px] font-bold">Other choices</h3>
          <div>
            <span className="text-muted-foreground">Language: </span>
            {r.run.language.code ?? "none"} (from {r.run.language.source ?? "—"}){r.form.editingLanguage && `; set by you: ${r.form.editingLanguage}`}
          </div>
          <div>
            <span className="text-muted-foreground">Pages: </span>
            {r.pages}
            {r.run.pageRange && ` (engine suggested ${r.run.pageRange.start}–${r.run.pageRange.end})`}
          </div>
          <div>
            <span className="text-muted-foreground">Book name: </span>
            {r.form.label || "—"}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Dev mode's decision report (development builds, `?dev`): a button bottom-left that opens a panel
 * with every decision of this run (the engine's guess, the other reading, what was asked and why,
 * the answer given, what is used now; each setting with the rule that picked it), the full engine
 * walkthrough, and Copy as Markdown / Download JSON to attach to a bug or a test note.
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
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-3 overflow-hidden p-0 sm:max-w-[min(96vw,960px)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4 pr-12">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-[16px]">Decision report</SheetTitle>
              <SheetDescription className="text-[12.5px]">Dev mode · every decision of this run, live. Hide with ?dev=0, show again with ?dev.</SheetDescription>
            </div>
            <button type="button" onClick={copy} className="h-8 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-border hover:bg-muted">
              {copied ? "Copied" : "Copy as Markdown"}
            </button>
            <button type="button" onClick={download} className="h-8 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-border hover:bg-muted">
              Download JSON
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
            {!input.rec && !input.failure && <p className="py-6 text-[13px] text-muted-foreground">No recommendation yet: drop a PDF and wait for the reading.</p>}
            <LiveDecisions r={report} />
            {input.rec && (
              <details className="mt-6">
                <summary className="cursor-pointer text-[14px] font-bold">How the engine decided (walkthrough)</summary>
                <div className="mt-3">
                  <Walkthrough rec={input.rec} file={input.file} />
                </div>
              </details>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
