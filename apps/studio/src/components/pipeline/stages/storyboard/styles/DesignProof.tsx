import { useState } from "react"
import type { PublisherDocument, PublisherPage, PublisherPreview } from "@adt/types"
import { Trans, useLingui } from "@lingui/react/macro"
import { BASE_URL, getBookFontFileUrl } from "@/api/client"
import { useBookFonts } from "@/hooks/use-book-fonts"
import { Button } from "@/components/ui/button"
import { PageLayoutEditor } from "./PageLayoutEditor"
import { ProofFrame } from "./ProofFrame"

// eslint-disable-next-line lingui/no-unlocalized-strings -- HTML entities, not visible copy.
const escapeAttribute = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")

export function DesignProof({ bookLabel, document, page, preview, busy, frozen, onChange, onInspect }: {
  bookLabel: string; document: PublisherDocument; page: PublisherPage; preview?: PublisherPreview;
  busy: boolean; frozen: boolean; onChange: (document: PublisherDocument) => void; onInspect: (id: string) => void;
}) {
  const { t } = useLingui()
  const [showSource, setShowSource] = useState(false)
  const [mobile, setMobile] = useState(false)
  const { data: fonts } = useBookFonts(bookLabel)
  const origin = new URL(BASE_URL, window.location.href).origin
  const assets = `${origin}/api/books/${encodeURIComponent(bookLabel)}/adt-preview/assets`
  /* eslint-disable lingui/no-unlocalized-strings -- Sandboxed HTML document and CSS, not UI copy. */
  const fontCss = (fonts?.fonts ?? []).flatMap((f) => f.faces.map((face) =>
    `@font-face{font-family:${JSON.stringify(f.family).replaceAll("<", "\\3c ")};font-style:${face.style};font-weight:${face.weight};src:url(${JSON.stringify(new URL(getBookFontFileUrl(bookLabel, f.id, face.file), origin).href)});}`,
  )).join("\n")
  const srcDoc = preview ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${origin} data:; style-src ${origin} 'unsafe-inline'; font-src ${origin} data:;"><base href="${escapeAttribute(origin)}/"><link rel="stylesheet" href="${escapeAttribute(assets)}/fonts.css"><style>${fontCss}\n${preview.css}</style></head><body>${preview.html}</body></html>` : ""
  /* eslint-enable lingui/no-unlocalized-strings */
  const reasons = {
    chapter: t`A chapter title or opening section suggests an opener.`,
    exercise: t`Exercise content suggests an activity page.`,
    reference: t`Tables, definitions, or reference content suggest a reference page.`,
    image: t`Illustrations suggest an illustrated page.`,
    prose: t`Text content suggests a reading page.`,
  }
  const warnings: Record<string, string> = {
    "extraction-only": t`Inferred from PDF text. Run Sectioning for semantic roles and groups.`,
    "image-alt-review": t`Image descriptions need editorial review.`,
    "table-review": t`Table structure needs editorial review.`,
    "rich-text-review": t`Rich text and math are shown as source text in this prototype.`,
    "static-activity": t`Activities are static proofs; interactions are not generated.`,
  }
  const bindingEntries = [...Object.entries(page.textStyles), ...Object.entries(page.components)]
  return <div className="min-w-0 space-y-4">
    <PageLayoutEditor key={page.id} page={page} frozen={frozen} onChange={(regions) => onChange({ ...document, pages: document.pages.map((p) => p.id === page.id ? { ...p, regions } : p) })} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-medium">{frozen ? t`Saved Styles proof` : t`Live proof`}</p><p className="text-xs text-muted-foreground">{busy ? t`Updating preview…` : t`The same content. A shared design system.`}</p></div>
      <div className="flex gap-2"><Button size="sm" variant={mobile ? "secondary" : "outline"} onClick={() => setMobile(!mobile)}>{mobile ? t`Desktop` : t`Mobile`}</Button><Button size="sm" variant={showSource ? "secondary" : "outline"} onClick={() => setShowSource(!showSource)}><Trans>Compare source</Trans></Button></div>
    </div>
    <div className={`grid gap-4 ${showSource ? "xl:grid-cols-2" : ""}`}>
      {showSource && <div className="overflow-hidden rounded-lg border bg-white"><div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><Trans>Original PDF</Trans></div><img className="h-[640px] w-full object-contain object-top" src={`${BASE_URL}/books/${encodeURIComponent(bookLabel)}/images/${encodeURIComponent(page.pageId)}_page`} alt={t`Source page ${page.pageNumber}`} /></div>}
      <div className={`mx-auto w-full overflow-hidden rounded-lg border bg-muted/40 shadow-sm ${mobile ? "max-w-[390px]" : ""}`}>
        {preview ? <ProofFrame srcDoc={srcDoc} width={mobile ? 390 : document.masters.find((m) => m.id === page.masterId)?.maxWidth ?? 1040} /> : <div className="flex h-[680px] items-center justify-center text-sm text-muted-foreground"><Trans>Preparing proof…</Trans></div>}
      </div>
    </div>
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-background p-4">
      <div className="max-w-md"><p className="text-xs font-medium"><Trans>Page assignment</Trans></p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{reasons[page.reason]}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{page.id} · {page.sectionType}</p></div>
      <label className="grid gap-1.5 text-xs text-muted-foreground"><Trans>Page master</Trans><select aria-label={t`Page master`} disabled={frozen} className="h-9 min-w-40 rounded border bg-background px-3 text-foreground" value={page.masterId} onChange={(e) => onChange({ ...document, pages: document.pages.map((p) => p.id === page.id ? { ...p, masterId: e.target.value } : p) })}>{document.masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    </div>
    {!!preview?.warnings.length && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><p className="mb-1 font-medium"><Trans>Proofing notes</Trans></p>{preview.warnings.map((warning) => <p key={warning}>{warnings[warning] ?? warning}</p>)}</div>}
    {!frozen && <details className="rounded-lg border bg-background p-3 text-xs"><summary className="cursor-pointer font-medium"><Trans>Content → style and component assignments</Trans></summary><div className="mt-3 max-h-72 space-y-2 overflow-auto">{bindingEntries.map(([nodeId, id]) => {
      const textStyle = document.styles.find((s) => s.id === id)
      const choices = textStyle ? document.styles : document.components
      return <div key={nodeId} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"><code className="truncate text-[10px] text-muted-foreground">{nodeId}</code><select aria-label={t`Style for ${nodeId}`} className="h-8 min-w-0 rounded border bg-background px-2" value={id} onChange={(e) => onChange({ ...document, pages: document.pages.map((p) => p.id === page.id ? { ...p, [textStyle ? "textStyles" : "components"]: { ...(textStyle ? p.textStyles : p.components), [nodeId]: e.target.value } } : p) })}>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select><Button size="sm" variant="ghost" onClick={() => onInspect(id)}><Trans>Edit</Trans></Button></div>
    })}</div></details>}
    {preview && <details className="rounded-lg border bg-background p-3 text-xs"><summary className="cursor-pointer font-medium"><Trans>Inspect generated CSS and HTML</Trans></summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-[10px]">{preview.css}{"\n\n"}{preview.html}</pre></details>}
  </div>
}
