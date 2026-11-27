import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpen, Layers3, Loader2, Palette, Play, Save, ScanLine, Type } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PublisherDocument, PublisherState } from "@adt/types"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { useRegisterDirtyTabs } from "@/hooks/use-settings-dirty-tabs"
import { DesignInspector } from "./DesignInspector"
import { DesignProof } from "./DesignProof"
import { LearningDesign } from "./LearningDesign"

export function PublisherStyles({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const query = useQuery({ queryKey: ["publisher-styles", bookLabel], queryFn: () => api.getPublisherStyles(bookLabel) })
  if (query.isPending) return <div className="p-8 text-sm text-muted-foreground">{t`Loading styles…`}</div>
  if (query.error) return <div role="alert" className="p-8 text-sm text-destructive">{query.error.message}<Button className="ml-3" variant="outline" onClick={() => query.refetch()}><Trans>Retry</Trans></Button></div>
  return <StylesWorkspace bookLabel={bookLabel} state={query.data} />
}

function StylesWorkspace({ bookLabel, state }: { bookLabel: string; state: PublisherState }) {
  const { t } = useLingui()
  const client = useQueryClient()
  const navigate = useNavigate()
  const bookConfig = useBookConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const [draft, setDraft] = useState<PublisherDocument | null>(null)
  const [draftBaseVersion, setDraftBaseVersion] = useState<number | null>(null)
  const [preset, setPreset] = useState<PublisherDocument["preset"]>(state.document?.preset ?? "editorial")
  const [panel, setPanel] = useState<"masters" | "styles" | "components">("masters")
  const [selectedId, setSelectedId] = useState("")
  const [pageId, setPageId] = useState("")
  const [frozen, setFrozen] = useState(false)
  const [notice, setNotice] = useState("")
  const storyboard = useQuery({ queryKey: ["publisher-storyboard", bookLabel, state.generated?.version], queryFn: () => api.getPublisherStoryboard(bookLabel), enabled: frozen })
  const liveDocument = draft ?? state.document
  const document = frozen && storyboard.data ? storyboard.data.document : liveDocument
  const dirty = draft !== null
  useRegisterDirtyTabs(`publisher-${bookLabel}`, "storyboard", dirty ? ["styles"] : [], true)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const page = document?.pages.find((p) => p.id === pageId) ?? document?.pages[0]
  const [proofDocument, setProofDocument] = useState(document)
  useEffect(() => { const timer = setTimeout(() => setProofDocument(document), 250); return () => clearTimeout(timer) }, [document])
  const preview = useQuery({
    queryKey: ["publisher-proof", bookLabel, proofDocument, page?.id],
    queryFn: () => api.previewPublisherStyles(bookLabel, proofDocument!, page!.id),
    enabled: !!proofDocument && !!page && proofDocument.pages.some((p) => p.id === page.id) && !frozen,
    staleTime: Infinity, gcTime: 0, retry: false,
  })
  const accept = (value: PublisherState) => { client.setQueryData(["publisher-styles", bookLabel], value); setDraft(null); setDraftBaseVersion(null) }
  const analyze = useMutation({ mutationFn: async () => { const baseVersion = state.version; return { document: await api.analyzePublisherStyles(bookLabel, preset), baseVersion } }, onSuccess: (value) => { setDraft(value.document); setDraftBaseVersion(value.baseVersion); setSelectedId(""); setPageId(""); setFrozen(false); setNotice(t`Design extracted. Review the library, then save or generate.`) } })
  const layouts = useMutation({ mutationFn: async () => { const baseVersion = draftBaseVersion ?? state.version; return { document: await api.detectPublisherLayouts(bookLabel, liveDocument!), baseVersion } }, onSuccess: (value) => { setDraft(value.document); setDraftBaseVersion(value.baseVersion); setFrozen(false); setNotice(t`Mixed layouts detected. Your text and object styles are preserved. Review the regions, then save or generate.`) } })
  const learning = useMutation({ mutationFn: async (accent: string) => { const baseVersion = draftBaseVersion ?? state.version; return { document: await api.applyPublisherLearningDesign(bookLabel, liveDocument!, accent), baseVersion } }, onSuccess: (value) => { setDraft(value.document); setDraftBaseVersion(value.baseVersion); setFrozen(false); setPanel("components"); setSelectedId("pub-learning-question"); setNotice(t`Learning design applied to the draft. Review the cards and headers, then save.`) } })
  const save = useMutation({ mutationFn: (generate: boolean) => api.savePublisherStyles(bookLabel, liveDocument!, draftBaseVersion ?? state.version, generate), onSuccess: (value, generate) => { accept(value); setFrozen(generate); setNotice(generate ? t`Styles proof saved. Use in Storyboard to render these layouts in the main storyboard.` : t`Design saved as a new version.`) } })
  const restore = useMutation({ mutationFn: (version: number) => api.restorePublisherStyles(bookLabel, version, state.version), onSuccess: (value) => { accept(value); setFrozen(false); setNotice(t`Previous design restored as a new version.`) } })
  const busy = learning.isPending || analyze.isPending || save.isPending || restore.isPending || layouts.isPending || updateConfig.isPending
  const error = learning.error ?? updateConfig.error ?? analyze.error ?? layouts.error ?? save.error ?? restore.error ?? preview.error ?? storyboard.error
  const items = document?.[panel] ?? []
  const selection = items.find((item) => item.id === selectedId) ?? items[0]
  const inspect = (id: string) => { if (document?.styles.some((s) => s.id === id)) setPanel("styles"); else if (document?.components.some((s) => s.id === id)) setPanel("components"); else setPanel("masters"); setSelectedId(id) }
  const change = (next: PublisherDocument) => { if (!draft) setDraftBaseVersion(state.version); setDraft(next); setNotice("") }
  const savedPage = storyboard.data?.pages.find((p) => p.id === page?.id)
  const proof = frozen ? (savedPage && storyboard.data ? { ...savedPage, css: storyboard.data.css } : undefined) : preview.data

  return <div className="min-h-full bg-muted/20">
    <header className="border-b bg-background px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700"><Palette className="h-3.5 w-3.5" /><Trans>Publisher design lab</Trans><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] tracking-normal text-amber-800"><Trans>Prototype</Trans></span></div><h1 className="text-2xl font-semibold tracking-tight"><Trans>One book. One design language.</Trans></h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground"><Trans>Extract a reusable library, refine its styles and page masters, then flow your content into a consistent storyboard.</Trans></p></div>
        <div className="flex flex-wrap gap-2">
          {document && <><Button variant="outline" disabled={busy || !dirty} onClick={() => save.mutate(false)}><Save className="mr-2 h-4 w-4" /><Trans>Save design</Trans></Button><Button className="bg-emerald-800 text-white hover:bg-emerald-900" disabled={busy || state.sourceChanged && !draft} onClick={() => save.mutate(true)}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}<Trans>Generate Styles proof</Trans></Button></>}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-3">
        <ScanLine className="h-4 w-4 text-muted-foreground" /><label className="sr-only" htmlFor="publisher-preset"><Trans>Design starting point</Trans></label><select id="publisher-preset" value={preset} disabled={busy || dirty} onChange={(e) => setPreset(e.target.value as PublisherDocument["preset"])} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="editorial">{t`Fieldnotes — designed template`}</option><option value="source">{t`Learn typography from this PDF`}</option></select><Button size="sm" variant="outline" disabled={busy || dirty || state.sourcePageCount === 0} onClick={() => analyze.mutate()}>{analyze.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}{document ? t`Analyze again` : t`Analyze book`}</Button>
        {liveDocument && <Button size="sm" variant="outline" disabled={busy || state.sourceChanged || frozen} onClick={() => layouts.mutate()}><Layers3 className="mr-2 h-4 w-4" /><Trans>Detect mixed layouts</Trans></Button>}
        <span className="text-xs text-muted-foreground">{t`${state.sourcePageCount} source pages · deterministic analysis · no AI calls`}</span>
        {state.versions.length > 0 && <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><Trans>History</Trans><select aria-label={t`Restore design version`} value={state.version} disabled={dirty || busy} onChange={(e) => restore.mutate(Number(e.target.value))} className="h-8 rounded border bg-background px-2">{[...state.versions].reverse().map((version) => <option key={version} value={version}>{t`Version ${version}`}</option>)}</select></label>}
        {dirty && <><span className="text-xs text-amber-700"><Trans>Unsaved design</Trans></span><Button size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setDraftBaseVersion(null); setNotice("") }}><Trans>Discard draft</Trans></Button></>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-950"><p className="max-w-3xl leading-relaxed"><Trans>The Styles proof is separate from the main Storyboard. Save your design, then use Publisher styles — mixed layouts as its render strategy. Fixed column templates do not use these regions.</Trans></p><Button size="sm" variant="outline" disabled={busy || dirty || state.sourceChanged || !state.document || !bookConfig.data} onClick={() => updateConfig.mutate({ label: bookLabel, config: { ...bookConfig.data!.config, default_render_strategy: "publisher_styles" } }, { onSuccess: () => { void navigate({ to: "/books/$label/$step/settings", params: { label: bookLabel, step: "storyboard" }, search: { tab: "overview" } }) } })}><Trans>Use in Storyboard</Trans></Button></div>
    </header>
    {error && <div role="alert" className="mx-6 mt-4 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div>}
    {notice && <div role="status" className="mx-6 mt-4 text-sm text-emerald-700">{notice}</div>}
    {state.sourceChanged && <div className="mx-6 mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Trans>The book content has changed since this design was saved. Analyze again before generating.</Trans></div>}
    {!document ? <div className="mx-auto max-w-3xl px-8 py-16"><div className="grid gap-6 md:grid-cols-3">{[
      { icon: Type, title: t`Paragraph styles`, body: t`Shared fonts, sizes, colors, spacing, and alignment, with evidence from your PDF.` },
      { icon: Layers3, title: t`Reusable components`, body: t`Figures, callouts, and content groups become a finite library of repeatable designs.` },
      { icon: BookOpen, title: t`Page masters`, body: t`Opening, reading, illustrated, activity, and reference pages share consistent templates.` },
    ].map(({ icon: Icon, title, body }) => <div key={title} className="rounded-xl border bg-background p-5"><Icon className="mb-4 h-6 w-6 text-emerald-700" /><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p></div>)}</div><p className="mt-8 text-center text-sm text-muted-foreground">{state.sourcePageCount === 0 ? t`Run Extract on your PDF first, then return here. Sectioning improves semantic grouping.` : t`Choose a starting point above and analyze your book to build the library.`}</p></div> : <>
      <div className="flex flex-wrap items-center gap-5 border-b bg-background/60 px-6 py-3 text-xs text-muted-foreground"><span>{t`${document.styles.length} paragraph styles`}</span><span>{t`${document.components.length} components`}</span><span>{t`${document.masters.length} page masters`}</span><span>{t`${document.pages.length} output pages`}</span><div className="ml-auto flex gap-2"><Button size="sm" variant={frozen ? "ghost" : "secondary"} onClick={() => setFrozen(false)}><Trans>Live design</Trans></Button><Button size="sm" variant={frozen ? "secondary" : "ghost"} disabled={!state.generated} onClick={() => setFrozen(true)}><Trans>Saved Styles proof</Trans></Button></div></div>
      {frozen && <p className="px-6 pt-4 text-xs text-muted-foreground">{t`Showing the saved Styles proof from design version ${state.generated?.designVersion ?? 0}. Switch to Live design to edit.`}</p>}
      <div className="grid items-start gap-6 p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
        <LearningDesign document={document} disabled={frozen || busy || state.sourceChanged} onApply={(accent) => learning.mutate(accent)} onChange={change} />
        <aside className={`overflow-hidden rounded-xl border bg-background ${frozen || busy ? "pointer-events-none opacity-50" : ""}`} inert={frozen || busy}>
          <div className="grid grid-cols-3 gap-1 border-b p-2">{([{ key: "masters", label: t`Masters`, icon: BookOpen }, { key: "styles", label: t`Text`, icon: Type }, { key: "components", label: t`Objects`, icon: Layers3 }] as const).map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => { setPanel(key); setSelectedId("") }} className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] ${panel === key ? "bg-emerald-50 text-emerald-800" : "text-muted-foreground hover:bg-muted"}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
          <div className="max-h-64 overflow-auto p-2">{items.map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className={`mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs ${selection?.id === item.id ? "bg-muted font-semibold" : "hover:bg-muted/50"}`}><span className="truncate">{item.name}</span><span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{"evidence" in item ? item.evidence.count : document.pages.filter((p) => p.masterId === item.id).length}</span></button>)}</div>
          {selection && <DesignInspector document={document} selectedId={selection.id} onChange={change} />}
        </aside>
        </div>
        <main className="min-w-0 space-y-4" inert={busy}>
          <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label={t`Book pages`}>{document.pages.map((p) => <button type="button" key={p.id} onClick={() => setPageId(p.id)} className={`shrink-0 rounded-lg border px-3 py-2 text-left ${page?.id === p.id ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "bg-background hover:bg-muted"}`}><span className="block text-xs font-semibold">{t`Page ${p.pageNumber}`}</span><span className="text-[10px] text-muted-foreground">{document.masters.find((m) => m.id === p.masterId)?.name}</span></button>)}</div>
          {page && <DesignProof bookLabel={bookLabel} document={document} page={page} preview={proof} busy={preview.isFetching || document !== proofDocument} frozen={frozen} onChange={change} onInspect={inspect} />}
        </main>
      </div>
    </>}
  </div>
}
