// Local experiment entry; intentionally not included in Studio's production routes.
import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { I18nProvider } from "@lingui/react"
import { i18n } from "@lingui/core"
import { useLingui } from "@lingui/react/macro"
import { HtmlEditor } from "adt-html-editor/shadcn"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { usePage } from "@/hooks/use-pages"
import { messages } from "@/locales/en.po"
import { ResponsiveCanvas } from "./ResponsiveCanvas"
import { bookColumnSample } from "./bookSample"
import { StyleInspection } from "./inspection/StyleInspection"
import { PositionProvider } from "./position/PositionProvider"
import { StylesPanel } from "../../panel/StylesPanel"
import "adt-html-editor/style.css"
import "@/styles/globals.css"

i18n.load("en", messages)
i18n.activate("en")

function Playground({ bookSample }: { bookSample?: string }) {
  const { t } = useLingui()
  const [reset, setReset] = useState(0)
  const [html, setHtml] = useState("")
  const [source, setSource] = useState(false)
  const [styles, setStyles] = useState(false)
  const [example, setExample] = useState(bookSample ? "book-columns" : "nested")
  const sample = useMemo(() => {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- HTML entity syntax, not displayed copy.
    const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;")
    const art = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#e7efe8"/><circle cx="480" cy="95" r="48" fill="#e7b868"/><path d="M0 260 180 85 360 285 480 160 640 305V360H0Z" fill="#94b7a5"/><path d="M0 310 185 215 360 320 520 260 640 320V360H0Z" fill="#456f61"/><path d="m295 360 76-102 48 102" fill="#c6d8cc"/></svg>')
    return `<article style="max-width: 900px; margin: 0 auto; padding: 32px; background: #fff; color: #253f36; font-family: system-ui;">
      <p style="font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 12px; color: #527465;">${escape(t`Field notes / Chapter 01`)}</p>
      <h1 style="font-size: 40px; line-height: 1.1; margin-bottom: 20px;">${escape(t`Room to explore`)}</h1>
      <p style="font-size: 18px; line-height: 1.6; margin-bottom: 24px;">${escape(t`A responsive page is a conversation between its content and its containers. Try moving, resizing, and giving things a little more room.`)}</p>
      <div style="padding: 24px; border: 1px solid #c9d9d0; border-radius: 16px; background: #f6f8f5; margin-bottom: 24px;">
        <img id="demo-image" src="${art}" alt="${escape(t`Illustrated mountain landscape`)}" style="display: block; width: 55%; height: auto; border-radius: 10px; margin-bottom: 16px;" />
        <h2 style="font-size: 24px; margin-bottom: 12px;">${escape(t`Start with this image`)}</h2>
        <p style="font-size: 16px; line-height: 1.6;">${escape(t`Click the image, then drag it toward the center or right. Pull a corner to resize it. The dashed outline shows the parent it belongs to.`)}</p>
      </div>
      <div style="display: flex; gap: 16px; padding: 20px; border-radius: 12px; background: #f2eee4; margin-bottom: 24px;">
        <div style="flex: 1; min-width: 0;"><h3 style="font-size: 20px; margin-bottom: 8px;">${escape(t`A nested layout`)}</h3><p style="line-height: 1.6;">${escape(t`These two cards share a flex row. Select a card to see which controls are safe, or select the text inside it.`)}</p></div>
        <div style="flex: 1; min-width: 0;"><h3 style="font-size: 20px; margin-bottom: 8px;">${escape(t`Keep the structure`)}</h3><p style="line-height: 1.6;">${escape(t`Use the parent button to work one level up. Text stays in its container and flows when the viewport changes.`)}</p></div>
      </div>
      <p style="font-size: 16px; line-height: 1.6;">${escape(t`Try a narrow viewport after editing. Every change can be undone with the history controls.`)}</p>
    </article>`
  }, [t])
  const baseline = useMemo(() => {
    if (example === "book" && bookSample) return bookSample
    if (example === "book-columns" && bookSample) return bookColumnSample(bookSample)
    if (example === "nested") return sample
    const template = document.createElement("template")
    template.innerHTML = sample
    const image = template.content.querySelector("img")!
    const container = image.parentElement!
    if (example === "components") {
      const article = template.content.querySelector("article")!
      article.querySelector("p")!.remove()
      article.querySelector("h1")!.textContent = t`Components and columns`
      article.querySelector("p")!.textContent = t`Select a figure or aside and drag it to move. Use Reposition to move a whole group, or Layout to try columns, stacking, and floats.`
      const aside = document.createElement("aside")
      aside.id = "demo-aside"
      aside.className = "float-right w-1/3 ml-6 mb-6 max-lg:float-none max-lg:w-full max-lg:ml-0 rounded-xl bg-amber-100 p-5"
      aside.append(container.querySelector("h2")!, container.querySelector("p")!)
      aside.querySelector("h2")!.textContent = t`Keep the structure`
      aside.querySelector("p")!.textContent = t`Use the parent button to work one level up. Text stays in its container and flows when the viewport changes.`
      container.replaceWith(aside)
      const pair = document.createElement("div")
      pair.id = "demo-columns"
      pair.className = "clear-both grid grid-cols-2 max-lg:grid-cols-1 gap-6 items-start mb-6"
      for (let index = 0; index < 2; index++) {
        const figure = document.createElement("figure")
        figure.id = index ? "second-figure" : "first-figure"
        figure.className = "flex flex-col gap-3 rounded-xl bg-emerald-50 p-4"
        const art = image.cloneNode(true) as HTMLImageElement
        art.id = index ? "second-image" : "demo-image"
        art.style.width = "100%"
        const caption = document.createElement("figcaption")
        caption.textContent = index ? t`Keep the structure` : t`A nested layout`
        figure.append(art, caption)
        pair.append(figure)
      }
      aside.after(pair)
      const destination = document.createElement("div")
      destination.id = "demo-destination"
      destination.className = "min-h-24 rounded-xl border-2 border-dashed border-emerald-300 p-8 mb-6"
      destination.setAttribute("aria-label", t`Empty container`)
      pair.nextElementSibling!.replaceWith(destination)
      return template.innerHTML
    }
    container.replaceWith(...container.childNodes)
    const article = template.content.querySelector("article")!
    article.replaceWith(...article.childNodes)
    image.style.removeProperty("display")
    if (example === "paragraph" || example === "prose") {
      const paragraph = document.createElement("p")
      image.before(paragraph)
      paragraph.append(image)
      if (example === "prose") paragraph.append(document.createTextNode(t`Keep the structure`))
    } else if (example === "loose") {
      image.after(document.createTextNode(t`Keep the structure`))
    }
    return template.innerHTML
  }, [sample, example, t, bookSample])
  const presets = [{ id: "wide", label: t`Desktop`, width: 0 }, { id: "editor", label: t`Editor width`, width: 794 }, { id: "tablet", label: t`Tablet`, width: 768 }, { id: "phone", label: t`Mobile`, width: 390 }]

  return <div className="flex h-dvh flex-col bg-muted/40 text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-4">
      <div><h1 className="text-lg font-semibold">{t`Responsive canvas lab`}</h1><p className="text-xs text-muted-foreground">{bookSample ? t`Page test copy · changes are not saved to the book` : t`A hands-on prototype · changes stay in this playground`}</p></div>
      <div className="flex gap-2">
        <select aria-label={t`Image structure`} value={example} className="rounded-lg border bg-background px-3 py-2 text-xs" onChange={event => { setExample(event.target.value); setReset(reset + 1); setHtml("") }}>
          {bookSample && <><option value="book-columns">{t`Book page · two columns`}</option><option value="book">{t`Book page · original layout`}</option></>}
          <option value="nested">{t`A nested layout`}</option>
          <option value="components">{t`Components and columns`}</option>
          <option value="bare">{t`Bare image`}</option>
          <option value="paragraph">{t`Image-only paragraph`}</option>
          <option value="prose">{t`Image in a sentence`}</option>
          <option value="loose">{t`Image beside loose text`}</option>
        </select>
        <button className="rounded-lg border bg-background px-3 py-2 text-xs" onClick={() => setSource(!source)}>{t`Inspect HTML`}</button>
        <button className="rounded-lg border bg-background px-3 py-2 text-xs" aria-pressed={styles} onClick={() => setStyles(!styles)}>{t`Styles`}</button>
        <button className="rounded-lg border bg-background px-3 py-2 text-xs" onClick={() => { setReset(reset + 1); setHtml("") }}>{t`Reset sample`}</button>
      </div>
    </header>
    <HtmlEditor key={reset} value={html || baseline} onChange={setHtml} layout="flow" className="flex min-h-0 flex-1">
      <StyleInspection><PositionProvider>
      <aside className="hidden w-52 shrink-0 border-r bg-card xl:block"><HtmlEditor.Layers /></aside>
      <HtmlEditor.Canvas className="min-h-0 min-w-0 flex-1">
        <HtmlEditor.Canvas.Toolbar className="h-12 justify-between px-4"><HtmlEditor.History /><HtmlEditor.Canvas.WidthPresets presets={presets} /></HtmlEditor.Canvas.Toolbar>
        <ResponsiveCanvas />
      </HtmlEditor.Canvas>
      {styles && <aside className="flex w-80 shrink-0 border-l bg-card"><StylesPanel editable /></aside>}
      {source && <aside className="w-80 shrink-0 overflow-auto border-l bg-card p-4"><h2 className="mb-3 text-sm font-medium">{t`Inspect HTML`}</h2><pre className="whitespace-pre-wrap break-all text-[10px]">{html || baseline}</pre></aside>}
      </PositionProvider></StyleInspection>
    </HtmlEditor>
  </div>
}

function PlaygroundEntry() {
  const { t } = useLingui()
  const params = new URLSearchParams(window.location.search)
  const book = params.get("book") ?? "", pageId = params.get("page") ?? ""
  const page = usePage(book, pageId)
  if (!book || !pageId) return <Playground />
  if (page.isPending) return <p className="p-8">{t`Loading page…`}</p>
  const html = page.data?.rendering?.sections[0]?.html
  if (page.isError || !html) return <p className="p-8">{t`This page has no available HTML to test.`}</p>
  return <Playground bookSample={html} />
}

const queryClient = new QueryClient()
createRoot(document.getElementById("root")!).render(<I18nProvider i18n={i18n}><QueryClientProvider client={queryClient}><PlaygroundEntry /></QueryClientProvider></I18nProvider>)
