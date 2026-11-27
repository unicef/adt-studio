import type { PublisherDocument } from "@adt/types"
import { publisherComponentColors, tintPublisherColor } from "./publisher-theme.js"

export function publisherTreatmentCss(doc: PublisherDocument): string {
  return `
.pub-page[data-design=learning][data-master=opener]{border-top:0}
.pub-box{--pub-ink:#20352f;border:1px solid transparent;overflow-wrap:anywhere}.pub-box .pub-text{color:var(--pub-ink)}.pub-box .pub-box-body>:last-child,.pub-box .pub-box-body>:last-child>.pub-text:last-child{margin-bottom:0}
.pub-box>.pub-box-heading{margin:0;--pub-ink:var(--pub-heading-ink);background:var(--pub-heading-fill);border-radius:var(--pub-radius) var(--pub-radius) 0 0;padding:16px var(--pub-inset)}.pub-box>.pub-box-heading .pub-text{margin:0;font-size:var(--pub-header-size,1.25rem);line-height:1.3;letter-spacing:0}.pub-box>.pub-box-heading .pub-component{background:transparent;padding:0;border:0}
.pub-box>.pub-box-body{margin:0;padding:var(--pub-inset)}.pub-box-body>*+*{margin-top:var(--pub-box-gap)}
.pub-banner .pub-box-body .pub-text{margin:0}.pub-banner .pub-box-body .pub-text+.pub-text{font-size:1.125rem;margin-top:12px;letter-spacing:0.04em}
.pub-page .pub-banner-group>.pub-banner.pub-box{border-radius:0}.pub-page .pub-banner-group>.pub-banner.pub-box:first-child{border-radius:var(--pub-outer-radius) var(--pub-outer-radius) 0 0}.pub-page .pub-banner-group>.pub-banner.pub-box:last-child{border-radius:0 0 var(--pub-outer-radius) var(--pub-outer-radius)}.pub-page .pub-banner-group>.pub-banner.pub-box+*{margin-top:0}.pub-page .pub-banner-group>.pub-banner.pub-box+* .pub-box-body{padding-top:0}.pub-page .pub-banner-group>.pub-banner.pub-box+* .pub-text{font-size:1.125rem;display:inline}
${doc.components.filter((c) => c.treatment && c.treatment !== "plain").map((c) => {
    const palette = publisherComponentColors(c, doc)
    return `.pub-page .${c.id}.pub-box{--pub-ink:${palette.ink};--pub-heading-fill:${palette.header};--pub-heading-ink:${palette.headerInk};--pub-inset:${c.padding}px;--pub-header-size:${c.headerSize ?? 20}px;--pub-outer-radius:${c.radius}px;--pub-radius:${Math.max(0, c.radius - 1)}px;--pub-box-gap:${c.gap}px;display:block;padding:0;border-radius:${c.radius}px;background:${palette.surface};border-color:${c.treatment === "outline" ? palette.accent : tintPublisherColor(palette.accent, 0.7)}}`
  }).join("\n")}
.pub-region[data-flow=wrap]{display:flow-root}.pub-region[data-flow=wrap]>.pub-slot:first-child{width:calc(var(--pub-sidebar-width,33.333%) - var(--pub-gap)/2);margin-bottom:16px}.pub-region[data-flow=wrap][data-layout=sidebar-right]>.pub-slot:first-child{float:right;margin-left:var(--pub-gap)}.pub-region[data-flow=wrap][data-layout=sidebar-left]>.pub-slot:first-child{float:left;margin-right:var(--pub-gap)}
@media(max-width:640px){.pub-region[data-flow=wrap][data-layout]>.pub-slot:first-child{float:none;width:auto;margin:0 0 var(--pub-gap)}.pub-box>.pub-box-body{padding:min(var(--pub-inset),20px)}.pub-box>.pub-box-heading{padding:16px min(var(--pub-inset),20px)}.pub-banner .pub-box-body h1{font-size:clamp(28px,7vw,42px)}}
@media(forced-colors:active){.pub-box{border:2px solid CanvasText}.pub-box>.pub-box-heading{border-bottom:1px solid CanvasText}}
`
}
