import { useEffect, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { useDocument, useEditorSelector, useEditorStoreApi } from "adt-html-editor"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { editableTags, retagElement, retagOptions } from "./retag"

export function TagPicker({ id }: { id: string }) {
  const { t } = useLingui()
  const doc = useDocument(), store = useEditorStoreApi()
  const locked = useEditorSelector(state => state.locked), editing = useEditorSelector(state => state.editingTextId)
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [id, doc, locked, editing])
  const node = doc.nodes[id]
  if (!node || !("tag" in node)) return null
  const { tags, reason } = retagOptions(doc, id, locked, editing)
  const labels = { p: t`Paragraph`, h1: t`Heading 1`, h2: t`Heading 2`, h3: t`Heading 3`, h4: t`Heading 4`, h5: t`Heading 5`, h6: t`Heading 6`,
    span: t`Inline text`, div: t`Container`, section: t`Section`, article: t`Article`, aside: t`Aside`, blockquote: t`Quote`, header: t`Header`, footer: t`Footer`, nav: t`Navigation` }
  if (reason === "unsupported") return <span className="mr-1 rounded bg-muted px-1.5 py-1 font-mono text-[11px]">{node.tag}</span>
  return <Select value={node.tag} open={open} onOpenChange={setOpen} onValueChange={tag => { setOpen(false); retagElement(store, id, tag) }}>
    <SelectTrigger aria-label={t`Change HTML tag`} disabled={!!reason || tags.length < 2}
      title={reason === "locked" ? t`Unlock this element and its contents first.` : reason === "editing" ? t`Finish editing text to change its tag.` : t`Change tag · keep classes and inline styles`}
      className="mr-1 h-8 w-auto shrink-0 gap-1.5 border-0 bg-muted px-2 py-1 font-mono text-xs font-semibold shadow-none [&_svg]:size-3">
      <span>{node.tag}</span>
    </SelectTrigger>
    <SelectContent aria-label={t`HTML tag`} className="max-h-96 min-w-52" onPointerDown={event => event.stopPropagation()}>
      {editableTags.map(tag => <SelectItem key={tag} value={tag} disabled={!tags.includes(tag)} textValue={`${tag} ${labels[tag]}`}>
        <span className="inline-block w-16 font-mono text-xs text-muted-foreground">{tag}</span><span className="text-xs">{labels[tag]}</span>
      </SelectItem>)}
      {tags.length < editableTags.length && <p className="border-t px-3 pt-2 text-[10px] text-muted-foreground">{t`Some tags are unavailable for this content or parent.`}</p>}
    </SelectContent>
  </Select>
}
