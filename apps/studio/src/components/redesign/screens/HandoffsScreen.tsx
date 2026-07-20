import { useState } from "react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n as globalI18n, type MessageDescriptor } from "@lingui/core"
import {
  Scissors,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Pencil,
  Send,
  Check,
  User,
  Clock,
  FolderDown,
  FolderUp,
  BookOpen,
  GitMerge,
  Library,
  Puzzle,
  CircleDashed,
} from "lucide-react"
import { BookCover } from "../BookCover"
import type { CoverSpec } from "../data"

type PartState = "merged" | "self" | "out"

interface RawPart {
  range: MessageDescriptor
  pages: MessageDescriptor
  span: number
  state: PartState
  when: MessageDescriptor
}
interface RawSplit {
  title: MessageDescriptor
  authors: MessageDescriptor
  lang: MessageDescriptor
  bg: string
  fg: string
  accent: string
  pub: MessageDescriptor
  pages: number
  parts: RawPart[]
}

const SPLITS: RawSplit[] = [
  {
    title: msg`World History: Modern Era`,
    authors: msg`K. Owens, R. Mehta`,
    lang: msg`EN`,
    bg: "#1e293b",
    fg: "#ffffff",
    accent: "#f59e0b",
    pub: msg`ATLAS EDUCATION`,
    pages: 388,
    parts: [
      { range: msg`Front matter + Ch. 1–3`, pages: msg`pg 1–96`, span: 96, state: "merged", when: msg`Merged yesterday` },
      { range: msg`Ch. 4–7`, pages: msg`pg 97–198`, span: 102, state: "self", when: msg`You're editing · 20m ago` },
      { range: msg`Ch. 8–11`, pages: msg`pg 199–312`, span: 114, state: "out", when: msg`Exported 3 days ago` },
      { range: msg`Back matter & index`, pages: msg`pg 313–388`, span: 76, state: "out", when: msg`Exported 3 days ago` },
    ],
  },
  {
    title: msg`Introduction to Biology`,
    authors: msg`S. Okafor`,
    lang: msg`EN`,
    bg: "#166534",
    fg: "#ffffff",
    accent: "#86efac",
    pub: msg`GREENLEAF ACADEMIC`,
    pages: 420,
    parts: [
      { range: msg`Front matter + Units 1–3`, pages: msg`pg 1–210`, span: 210, state: "merged", when: msg`Merged 4 days ago` },
      { range: msg`Units 4–6 + index`, pages: msg`pg 211–420`, span: 210, state: "merged", when: msg`Merged 3 days ago` },
    ],
  },
  {
    title: msg`Geometry, an introduction`,
    authors: msg`Lin Wei, J. Castro`,
    lang: msg`EN`,
    bg: "#1e40af",
    fg: "#ffffff",
    accent: "#7dd3fc",
    pub: msg`OPENBOOKS PRESS`,
    pages: 238,
    parts: [
      { range: msg`Ch. 1–4`, pages: msg`pg 1–80`, span: 80, state: "out", when: msg`Exported today` },
      { range: msg`Ch. 5–8`, pages: msg`pg 81–160`, span: 80, state: "out", when: msg`Exported today` },
      { range: msg`Ch. 9–12 + index`, pages: msg`pg 161–238`, span: 78, state: "out", when: msg`Exported today` },
    ],
  },
]

const CONTRIB = [
  { partTitle: msg`Histoire-Géographie 5e`, range: msg`pg 160–240`, source: msg`Histoire-Géographie 5e`, bg: "#3f3f46", accent: "#fbbf24", pub: msg`ÉDITIONS LUMIÈRE`, note: msg`received 2 days ago`, stagesText: msg`3 stages`, statusCls: "bdg-warn", statusIcon: Pencil, statusText: msg`In progress` },
  { partTitle: msg`Química Orgánica`, range: msg`pg 1–90`, source: msg`Química Orgánica`, bg: "#5b21b6", accent: "#ddd6fe", pub: msg`EDITORIAL ANDINA`, note: msg`received yesterday`, stagesText: msg`1 stage`, statusCls: "bdg-sec", statusIcon: CircleDashed, statusText: msg`Not started` },
]

const PAGE_SIZE = 2

function cover(s: RawSplit): CoverSpec {
  return { bg: s.bg, fg: s.fg, accent: s.accent, publisherShort: globalI18n._(s.pub), placeholder: false, real: true }
}

export function HandoffsScreen() {
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true })
  const [moved, setMoved] = useState<Record<number, boolean>>({})
  const [page, setPage] = useState(0)

  const visible = SPLITS.map((bk, i) => ({ bk, i })).filter((x) => !moved[x.i])
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const startIdx = visible.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const endIdx = Math.min(visible.length, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "26px 32px 40px", background: "var(--background)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 20 }}>
        <div>
          <div style={{ font: "700 24px/1 var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 6 }}><Trans>Split & merge</Trans></div>
          <div style={{ font: "400 13.5px var(--font-sans)", color: "var(--muted-foreground)", maxWidth: 600 }}>
            <Trans>
              Split a book into page-range parts, export each as a <code>.zip</code> to hand off, then import the returned parts and merge them back into the source book.
            </Trans>
          </div>
        </div>
        <button style={{ marginLeft: "auto" }} className="btn btn-pri btn-sm">
          <Scissors className="lucide" style={{ width: 14, height: 14 }} />
          <Trans>Split a book</Trans>
        </button>
      </div>

      <div className="seclbl" style={{ marginBottom: 11 }}><Trans>Books you've split</Trans></div>

      {pageItems.map(({ bk, i }) => {
        const total = bk.parts.reduce((a, p) => a + p.span, 0)
        const sumBy = (st: PartState) => bk.parts.filter((p) => p.state === st).reduce((a, p) => a + p.span, 0)
        const mergedPages = sumBy("merged")
        const selfPages = sumBy("self")
        const outPages = total - mergedPages - selfPages
        const mergedCount = bk.parts.filter((p) => p.state === "merged").length
        const totalCount = bk.parts.length
        const outCount = bk.parts.filter((p) => p.state === "out").length
        const assembled = mergedCount === totalCount
        const isOpen = !!open[i]
        return (
          <div key={i} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-sm)", overflow: "hidden", marginBottom: 12 }}>
            <div onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", cursor: "pointer" }}>
              <div className="covbox" style={{ width: 46, height: 61, borderRadius: 5 }}>
                <BookCover title={i18n._(bk.title)} author={i18n._(bk.authors)} cover={cover(bk)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <h3 style={{ font: "600 17px var(--font-sans)", letterSpacing: "-0.01em", margin: 0 }}>{i18n._(bk.title)}</h3>
                  <span className="bdg bdg-out">{i18n._(bk.lang)}</span>
                  <span className={`bdg ${assembled ? "bdg-ok" : "bdg-warn"}`}>
                    {assembled ? <CheckCheck className="lucide" /> : <Clock className="lucide" />}
                    {assembled ? <Trans>Assembled</Trans> : <Trans>In progress</Trans>}
                  </span>
                </div>
                <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--muted-foreground)", margin: "4px 0 10px" }}>
                  <Trans>{bk.pages} pages · split into {totalCount} parts</Trans>
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--muted)", gap: 2, maxWidth: 440 }}>
                  <div style={{ width: `${((mergedPages / total) * 100).toFixed(1)}%`, background: "var(--brand-600)" }} />
                  <div style={{ width: `${((selfPages / total) * 100).toFixed(1)}%`, background: "var(--brand-400)" }} />
                  <div style={{ width: `${((outPages / total) * 100).toFixed(1)}%`, background: "var(--brand-300)" }} />
                </div>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <div style={{ font: "700 20px var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
                  {mergedCount}/{totalCount}
                </div>
                <div className="seclbl"><Trans>merged</Trans></div>
              </div>
              <ChevronDown className="lucide" style={{ width: 18, height: 18, color: "var(--muted-foreground)", flex: "none", transition: "transform .2s", transform: `rotate(${isOpen ? 180 : 0}deg)` }} />
            </div>

            {isOpen && (
              <div>
                {bk.parts.map((p, pi) => {
                  const merged = p.state === "merged"
                  const self = p.state === "self"
                  const Icon = merged ? CheckCheck : self ? Pencil : Send
                  const badgeCls = merged ? "bdg-ok" : self ? "bdg-brand" : "bdg-warn"
                  const BadgeIcon = merged ? Check : self ? User : Clock
                  const badgeText = merged ? t`Merged back` : self ? t`You're on it` : t`Awaiting return`
                  return (
                    <div key={pi} className="part">
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--muted)", display: "grid", placeItems: "center", color: "var(--muted-foreground)", flex: "none" }}>
                        <Icon className="lucide" style={{ width: 14, height: 14 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ font: "600 14px var(--font-sans)" }}>{i18n._(p.range)}</span>
                          <span style={{ font: "400 12px var(--font-mono)", color: "var(--muted-foreground)" }}>{i18n._(p.pages)}</span>
                        </div>
                        <div style={{ font: "400 12px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 2 }}>{i18n._(p.when)}</div>
                      </div>
                      <span className={`bdg ${badgeCls}`} style={{ minWidth: 132, justifyContent: "center" }}>
                        <BadgeIcon className="lucide" />
                        {badgeText}
                      </span>
                      {p.state === "out" && (
                        <button className="btn btn-out btn-sm" style={{ minWidth: 150, justifyContent: "center" }}>
                          <FolderDown className="lucide" style={{ width: 14, height: 14 }} />
                          <Trans>Import returned .zip</Trans>
                        </button>
                      )}
                      {merged && (
                        <button className="btn btn-out btn-sm" style={{ minWidth: 150, justifyContent: "center", color: "var(--muted-foreground)" }}>
                          <BookOpen className="lucide" style={{ width: 14, height: 14 }} />
                          <Trans>View in book</Trans>
                        </button>
                      )}
                      {self && (
                        <button className="btn btn-pri btn-sm" style={{ minWidth: 150, justifyContent: "center" }}>
                          <BookOpen className="lucide" style={{ width: 14, height: 14 }} />
                          <Trans>Open part</Trans>
                        </button>
                      )}
                    </div>
                  )
                })}

                {assembled ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: "var(--stage-validation-50)", borderTop: "1px solid var(--stage-validation-200)" }}>
                    <CheckCheck className="lucide" style={{ width: 20, height: 20, color: "#047857" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ font: "600 13.5px var(--font-sans)", color: "#065f46" }}><Trans>All parts merged — book assembled</Trans></div>
                      <div style={{ font: "400 12px var(--font-sans)", color: "#047857" }}>
                        <Trans>Every page has been returned and merged back. Move it out of Split & merge into your Library.</Trans>
                      </div>
                    </div>
                    <button className="btn btn-out btn-sm">
                      <BookOpen className="lucide" style={{ width: 14, height: 14 }} />
                      <Trans>Open book</Trans>
                    </button>
                    <button className="btn btn-pri btn-sm" onClick={() => setMoved((m) => ({ ...m, [i]: true }))}>
                      <Library className="lucide" style={{ width: 14, height: 14 }} />
                      <Trans>Move to Library</Trans>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: "var(--brand-50)", borderTop: "1px solid var(--brand-200)" }}>
                    <GitMerge className="lucide" style={{ width: 20, height: 20, color: "var(--brand-700)" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ font: "600 13.5px var(--font-sans)", color: "var(--brand-800)" }}><Trans>{mergedCount} of {totalCount} parts merged back</Trans></div>
                      <div style={{ font: "400 12px var(--font-sans)", color: "var(--brand-700)" }}>
                        <Plural
                          value={outCount}
                          one="Import the # remaining part when it comes back, then merge everything into the source book."
                          other="Import the # remaining parts when they come back, then merge everything into the source book."
                        />
                      </div>
                    </div>
                    <button className="btn btn-out btn-sm">
                      <FolderDown className="lucide" style={{ width: 14, height: 14 }} />
                      <Trans>Import a part .zip</Trans>
                    </button>
                    <button className={`btn btn-pri btn-sm${outCount > 0 ? " dis" : ""}`}>
                      <GitMerge className="lucide" style={{ width: 14, height: 14 }} />
                      <Trans>Merge all parts</Trans>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--muted-foreground)" }}>
            <Trans>Showing {startIdx}–{endIdx} of {visible.length} books</Trans>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <button onClick={() => setPage(Math.max(0, safePage - 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", display: "grid", placeItems: "center", color: "var(--foreground)", cursor: "pointer", opacity: safePage === 0 ? 0.4 : 1 }}>
              <ChevronLeft className="lucide" style={{ width: 14, height: 14 }} />
            </button>
            {Array.from({ length: totalPages }, (_, k) => (
              <button key={k} onClick={() => setPage(k)} style={{ minWidth: 32, height: 32, padding: "0 9px", borderRadius: 8, border: `1px solid ${k === safePage ? "var(--brand-600)" : "var(--border)"}`, background: k === safePage ? "var(--brand-600)" : "var(--card)", color: k === safePage ? "#fff" : "var(--foreground)", font: "600 12.5px var(--font-sans)", cursor: "pointer" }}>
                {k + 1}
              </button>
            ))}
            <button onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", display: "grid", placeItems: "center", color: "var(--foreground)", cursor: "pointer", opacity: safePage >= totalPages - 1 ? 0.4 : 1 }}>
              <ChevronRight className="lucide" style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      <div className="seclbl" style={{ margin: "26px 0 5px" }}><Trans>Parts shared with you</Trans></div>
      <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--muted-foreground)", marginBottom: 12 }}>
        <Trans>
          Parts of other books someone sent you to process. Work through the pages, then export and return the <code>.zip</code>.
        </Trans>
      </div>

      {CONTRIB.map((c, i) => {
        const StatusIcon = c.statusIcon
        const sourceText = i18n._(c.source)
        const noteText = i18n._(c.note)
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-sm)", padding: "16px 20px", marginBottom: 12 }}>
            <div className="covbox" style={{ width: 42, height: 55, borderRadius: 5 }}>
              <BookCover title={i18n._(c.partTitle)} author={i18n._(c.pub)} cover={{ bg: c.bg, fg: "#ffffff", accent: c.accent, publisherShort: i18n._(c.pub), placeholder: false, real: true }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ font: "600 15px var(--font-sans)" }}>{i18n._(c.partTitle)}</span>
                <span className="bdg bdg-sec" style={{ gap: 5 }}>
                  <Puzzle className="lucide" />
                  {i18n._(c.range)}
                </span>
              </div>
              <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 3 }}>
                <Trans>Part of {sourceText} · {noteText}</Trans>
              </div>
            </div>
            <span style={{ font: "500 12px var(--font-mono)", color: "var(--muted-foreground)" }}>{i18n._(c.stagesText)}</span>
            <span className={`bdg ${c.statusCls}`} style={{ minWidth: 112, justifyContent: "center" }}>
              <StatusIcon className="lucide" />
              {i18n._(c.statusText)}
            </span>
            <button className="btn btn-out btn-sm">
              <BookOpen className="lucide" style={{ width: 14, height: 14 }} />
              <Trans>Open part</Trans>
            </button>
            <button className="btn btn-pri btn-sm">
              <FolderUp className="lucide" style={{ width: 14, height: 14 }} />
              <Trans>Export & return .zip</Trans>
            </button>
          </div>
        )
      })}
    </div>
  )
}
