import { Fragment } from "react"
import { useLingui } from "@lingui/react/macro"
import { useDocument, useNodeSummary, useSelectedIds } from "adt-html-editor"
import { InspectorHeader } from "adt-html-editor/shadcn"
import { ChevronRight, CornerLeftUp, Heading, Lock, LockOpen, Pilcrow, SquareDashed } from "lucide-react"
import { TagPicker } from "./TagPicker"
import { editableTags } from "./retag"

export function TagInspectorHeader() {
  const selected = useSelectedIds(), doc = useDocument()
  const node = selected.length === 1 ? doc.nodes[selected[0]] : undefined
  if (node?.kind !== "element" || node.id === doc.rootId || !editableTags.some(tag => tag === node.tag)) return <InspectorHeader />
  return <InspectorHeader><SelectedTagHeader id={node.id} /></InspectorHeader>
}

function SelectedTagHeader({ id }: { id: string }) {
  const { t } = useLingui()
  const summary = useNodeSummary(id)
  if (!summary) return null
  const Icon = /^h[1-6]$/.test(summary.tag ?? "") ? Heading : summary.tag === "p" ? Pilcrow : SquareDashed
  return <div className="flex flex-col gap-1.5 py-2">
    <div className="flex items-center gap-2">
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Icon className="size-4" /></span>
      <div className="flex min-w-0 flex-1 items-center"><TagPicker id={id} />
        {summary.attrId && <span className="truncate font-mono text-xs text-muted-foreground">#{summary.attrId}</span>}
      </div>
      <button type="button" aria-label={summary.isLocked ? t`Unlock element` : t`Lock element`} title={summary.isLocked ? t`Unlock element` : t`Lock element`}
        aria-pressed={summary.isLocked} onClick={() => summary.setLocked(!summary.isLocked)} className="rounded p-1 text-muted-foreground hover:bg-accent">
        {summary.isLocked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
      </button>
      <button type="button" aria-label={t`Select parent`} title={t`Select parent`} disabled={!summary.parentId} onClick={summary.selectParent}
        className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"><CornerLeftUp className="size-3.5" /></button>
    </div>
    {!!summary.ancestors.length && <nav aria-label={t`Ancestors`} className="flex items-center gap-0.5 overflow-hidden font-mono text-[10px] text-muted-foreground">
      {summary.ancestors.map(crumb => <Fragment key={crumb.id}>
        <button type="button" className="truncate hover:text-foreground" onClick={() => summary.select(crumb.id)}>{crumb.label}</button><ChevronRight className="size-3 shrink-0" />
      </Fragment>)}<span className="truncate text-foreground">{summary.tag}</span>
    </nav>}
    {summary.textPreview && <p className="truncate text-xs italic text-muted-foreground" title={summary.textPreview}>{summary.textPreview}</p>}
  </div>
}
