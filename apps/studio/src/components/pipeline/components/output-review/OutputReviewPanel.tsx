import { useId, useState, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react"
import type { CatalogConflict, OutputStatus } from "@adt/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getEntryCategory } from "../../stages/languages/lib/catalog-entries"
import { ReviewActions } from "./ReviewActions"
import { ReviewRow } from "./ReviewRow"
import { identityKey, needsAttention } from "./review-plan"
import { reviewStatus } from "./review-status"

// Older projections expose only flat memberships. A single page is unambiguous;
// for multiple pages, keep page-only/section-only filtering but never invent pairs.
function sectionsOnPage(output: OutputStatus | CatalogConflict, page: string): string[] {
  if (!page) return output.sectionIds
  if (output.locations) return output.locations.flatMap((location) => location.pageId === page && location.sectionId ? [location.sectionId] : [])
  return output.pageIds.length === 1 && output.pageIds[0] === page ? output.sectionIds : []
}
function matchesLocation(output: OutputStatus | CatalogConflict, page: string, section: string): boolean {
  return (!page || output.pageIds.includes(page)) && (!section || sectionsOnPage(output, page).includes(section))
}

export function OutputReviewPanel({ bookLabel, outputs, catalog, conflicts = [], disclosure, renderDetail, defaultOpen = false }: {
  bookLabel: string; outputs: OutputStatus[]; catalog: OutputStatus[]; disclosure: boolean
  defaultOpen?: boolean
  conflicts?: CatalogConflict[]
  renderDetail: (output: OutputStatus) => ReactNode
}) {
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState(defaultOpen)
  const [category, setCategory] = useState("")
  const [language, setLanguage] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState("")
  const [section, setSection] = useState("")
  const id = useId()
  const affected = outputs.filter(needsAttention)
  const group = (output: OutputStatus) => output.group ?? getEntryCategory(output.identity.id)
  const categories = [...new Set([...affected.map(group), ...conflicts.map((item) => getEntryCategory(item.id))])].sort()
  const languages = [...new Set(affected.flatMap((output) => output.identity.language ? [output.identity.language] : []))].sort()
  const pages = [...new Set([...affected, ...conflicts].flatMap((output) => output.pageIds))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const sections = [...new Set([...affected, ...conflicts].flatMap((output) => sectionsOnPage(output, page)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const categoryLabel = (value: string) => value === "glossary" ? t`Glossary` : value === "quizzes" ? t`Quizzes` : value === "captions" ? t`Captions` : value === "easy-read" ? t`Easy Read` : value === "answers" ? t`Answers` : t`Page text`
  const languageLabel = (value: string) => {
    try { return new Intl.DisplayNames([i18n.locale || "en"], { type: "language" }).of(value) ?? value } catch { return value }
  }
  const scoped = affected.filter((output) => (!category || group(output) === category) && (!language || output.identity.language === language) &&
    matchesLocation(output, page, section))
  const scopedConflicts = conflicts.filter((item) => (!category || getEntryCategory(item.id) === category) &&
    matchesLocation(item, page, section))
  const issues = [
    { value: "update", label: t`Out of sync`, description: t`Generated content needs updating.` },
    { value: "review", label: t`Needs review`, description: t`Decide whether to keep or replace protected content.` },
    { value: "warning", label: t`Warnings`, description: t`A linked source or speech preparation needs attention.` },
    { value: "missing", label: t`Missing`, description: t`Content has not been generated or is unavailable.` },
  ].map((issue) => ({ ...issue, count: scoped.filter((output) => reviewStatus(output) === issue.value).length + (issue.value === "warning" ? scopedConflicts.length : 0) }))
  const visible = scoped.filter((output) => !status || reviewStatus(output) === status)
  const visibleConflicts = !status || status === "warning" ? scopedConflicts : []
  const filtered = !!(category || language || status || page || section)
  const count = visible.length + visibleConflicts.length
  if (!affected.length && !conflicts.length) return null
  const heading = <div className="space-y-1.5">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <span className="text-sm font-medium">{t`Items needing attention: ${count}`}</span>
      <span className="text-xs text-muted-foreground">{filtered ? t`Filtered items` : t`Across this book`}</span>
    </div>
    <div role="group" aria-label={t`Issue types`} className="flex flex-wrap gap-1">
      {issues.map((issue) => <button key={issue.value} type="button" aria-pressed={status === issue.value}
        title={issue.description} disabled={!issue.count && status !== issue.value}
        onClick={() => { setStatus(status === issue.value ? "" : issue.value); setOpen(true) }}
        className={cn("inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
          status === issue.value ? "border-border bg-muted text-foreground" : issue.count > 0 && "bg-muted/50")}>
        {issue.label}<span className="tabular-nums">{issue.count}</span>
      </button>)}
    </div>
  </div>
  const detailsButton = <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
    {open ? t`Hide details` : t`Review items`}{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
  </Button>
  // min-w-0: long item text must never widen a flex/grid parent (dialog, page).
  return <section className="my-2 min-w-0 rounded-lg border bg-background" aria-label={t`Content updates`}>
    {disclosure ? <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">{heading}{detailsButton}</div>
      : <ReviewActions scopeKey={`${category}|${language}|${status}|${page}|${section}`} bookLabel={bookLabel} outputs={visible} catalog={catalog} filtered={filtered} heading={heading} detailsButton={detailsButton} />}
    {open && <div id={id} className="border-t">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2 text-xs">
        <select aria-label={t`Content type`} className="h-8 rounded border bg-background px-2" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">{t`All content`}</option>{categories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
        </select>
        <select aria-label={t`Language`} className="h-8 rounded border bg-background px-2" value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="">{t`All languages`}</option>{languages.map((value) => <option key={value} value={value}>{languageLabel(value)}</option>)}
        </select>
        <select aria-label={t`Page`} className="h-8 rounded border bg-background px-2" value={page} onChange={(event) => { setPage(event.target.value); setSection("") }}>
          <option value="">{t`All pages`}</option>{pages.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={t`Section`} className="h-8 rounded border bg-background px-2" value={section} onChange={(event) => setSection(event.target.value)}>
          <option value="">{t`All sections`}</option>{sections.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={t`Status`} className="h-8 rounded border bg-background px-2" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t`All issues`}</option>{issues.map((issue) => <option key={issue.value} value={issue.value}>{issue.label}</option>)}
        </select>
        {filtered && <Button size="sm" variant="ghost" onClick={() => { setCategory(""); setLanguage(""); setStatus(""); setPage(""); setSection("") }}>{t`Clear filters`}</Button>}
      </div>
      <div className="max-h-72 divide-y overflow-auto">
        {visibleConflicts.map(({ id, pageIds }) => <div key={id} role="alert" className="space-y-1 px-3 py-2 text-xs">
          <p className="font-medium">{t`Duplicate source ID: ${id}`}</p>
          <p>{t`Different texts share this ID. The first text in reading order is used. Give different content distinct IDs in the source.`}</p>
          <p className="font-mono text-muted-foreground">{pageIds.join(", ")}</p>
        </div>)}
        {visible.map((output) => <ReviewRow key={identityKey(output.identity)} output={output} category={categoryLabel(group(output))} language={output.identity.language && languageLabel(output.identity.language)}>{renderDetail(output)}</ReviewRow>)}
        {!visible.length && !visibleConflicts.length && <p className="px-3 py-5 text-sm text-muted-foreground">{t`No items need attention with these filters.`}</p>}
      </div>
    </div>}
  </section>
}
