import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, Plural } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n } from "@lingui/core"
import { Plus, Scissors, ArrowRight } from "lucide-react"
import type { BookSummary } from "@/api/client"
import { BookCover } from "../BookCover"
import { toBookVM, type BookVM } from "../data"
import type { RedesignView } from "../types"

export interface HomeScreenProps {
  books: BookSummary[]
  locale: string
  onOpenAdd: () => void
  onNavigate: (view: RedesignView) => void
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return i18n._(msg`Good morning.`)
  if (h < 18) return i18n._(msg`Good afternoon.`)
  return i18n._(msg`Good evening.`)
}

function DiscRow({ discs, size = 17 }: { discs: BookVM["discs"]; size?: number }) {
  return (
    <div className="dscrow">
      {discs.map((d) => {
        const Icon = d.icon
        return (
          <div key={d.slug} className="sd" style={{ width: size, height: size, background: d.hex, color: "#fff" }}>
            <Icon className="lucide" />
          </div>
        )
      })}
    </div>
  )
}

export function HomeScreen({ books, locale, onOpenAdd, onNavigate }: HomeScreenProps) {
  const navigate = useNavigate()
  const openBook = (label: string) => navigate({ to: "/books/$label/$step", params: { label, step: "book" } })

  const vms = useMemo(() => {
    const sorted = [...books].sort(
      (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
    )
    return sorted.map((b) => toBookVM(b, locale))
  }, [books, locale])

  const feature = vms[0]
  const recents = vms.slice(1, 8)
  const splitCount = books.filter((b) => b.split && !b.split.fullyMerged).length
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }).format(new Date())

  return (
    <div style={{ position: "relative", height: "100%", overflow: "auto", padding: "14px 34px 24px", background: "var(--background)" }}>
      <div
        className="drift"
        style={{
          position: "absolute",
          width: 440,
          height: 440,
          right: -80,
          top: -120,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(43,127,255,.12), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div className="eyb">{dateLabel}</div>
        <div style={{ font: "700 24px/1.1 var(--font-sans)", letterSpacing: "-0.025em", margin: "6px 0 3px" }}>{greeting()}</div>
        <div style={{ font: "400 15px var(--font-sans)", color: "var(--muted-foreground)" }}>
          <Plural value={books.length} one="# book in production" other="# books in production" />
          {splitCount > 0 && (
            <>
              {" · "}
              <Plural value={splitCount} one="# split in progress" other="# splits in progress" />
            </>
          )}
          {"."}
        </div>

        {feature ? (
          <>
            <div style={{ margin: "13px 0 9px" }} className="seclbl">
              <Trans>Jump back in</Trans>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div className="brow" style={{ flex: 1, cursor: "pointer" }} onClick={() => openBook(feature.label)}>
                <div className="covbox" style={{ width: 150, alignSelf: "stretch", borderRadius: 0 }}>
                  <BookCover title={feature.displayTitle} author={feature.authors} cover={feature.cover} />
                </div>
                <div className="brow-body" style={{ padding: "13px 20px", gap: 9, justifyContent: "center" }}>
                  <div>
                    <div className="seclbl" style={{ marginBottom: 7 }}>
                      <Trans>Last edited {feature.modified}</Trans>
                    </div>
                    <h3 style={{ font: "700 20px/1.15 var(--font-sans)", letterSpacing: "-0.02em", margin: 0 }}>
                      {feature.displayTitle}
                    </h3>
                    <div style={{ font: "400 13px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 5 }}>
                      {feature.authors} · {feature.pagesText}
                    </div>
                  </div>
                  {feature.hasStages && <DiscRow discs={feature.discs} />}
                  <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                    <button
                      className="btn btn-pri btn-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        openBook(feature.label)
                      }}
                    >
                      <Trans>Continue editing</Trans>
                      <ArrowRight className="lucide" style={{ width: 14, height: 14 }} />
                    </button>
                    <button className="btn btn-out btn-sm" onClick={(e) => e.stopPropagation()}>
                      <Trans>Preview</Trans>
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ width: 230, display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  onClick={onOpenAdd}
                  style={{
                    flex: 1,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    boxShadow: "var(--shadow-sm)",
                    padding: 13,
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand-50)", display: "grid", placeItems: "center", color: "var(--brand-600)" }}>
                    <Plus className="lucide" style={{ width: 20, height: 20 }} />
                  </div>
                  <div style={{ font: "600 14px var(--font-sans)" }}><Trans>New book</Trans></div>
                  <div style={{ font: "400 12px/1.45 var(--font-sans)", color: "var(--muted-foreground)" }}><Trans>Upload a PDF to begin.</Trans></div>
                </div>
                <div
                  onClick={() => onNavigate("handoffs")}
                  style={{
                    flex: 1,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    boxShadow: "var(--shadow-sm)",
                    padding: 13,
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand-50)", display: "grid", placeItems: "center", color: "var(--brand-700)" }}>
                      <Scissors className="lucide" style={{ width: 20, height: 20 }} />
                    </div>
                  </div>
                  <div style={{ font: "600 14px var(--font-sans)" }}><Trans>Split & merge</Trans></div>
                  <div style={{ font: "400 12px/1.45 var(--font-sans)", color: "var(--muted-foreground)" }}>
                    <Trans>Break a book into parts and merge them back.</Trans>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div
            onClick={onOpenAdd}
            style={{
              marginTop: 22,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "2px dashed var(--border)",
              borderRadius: 14,
              background: "var(--card)",
              padding: "56px 20px",
              cursor: "pointer",
            }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 999, background: "var(--brand-50)", display: "grid", placeItems: "center", color: "var(--brand-600)" }}>
              <Plus className="lucide" style={{ width: 22, height: 22 }} />
            </div>
            <div style={{ font: "600 15px var(--font-sans)" }}><Trans>Add your first book</Trans></div>
            <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--muted-foreground)" }}><Trans>Upload a PDF to get started</Trans></div>
          </div>
        )}

        {feature && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", margin: "15px 0 10px" }}>
              <span style={{ font: "700 16px var(--font-sans)", letterSpacing: "-0.01em", color: "var(--foreground)" }}><Trans>Your library</Trans></span>
              <span style={{ marginLeft: 9, font: "400 13px var(--font-sans)", color: "var(--muted-foreground)" }}>
                <Plural value={books.length} one="# book" other="# books" />
              </span>
              <span
                onClick={() => onNavigate("library")}
                style={{ marginLeft: "auto", font: "500 12.5px var(--font-sans)", color: "var(--brand-700)", cursor: "pointer" }}
              >
                <Trans>View all →</Trans>
              </span>
            </div>
            <div style={{ display: "flex", gap: 18, overflowX: "auto", paddingBottom: 4 }}>
              <div style={{ width: 150, flex: "none", display: "flex", flexDirection: "column", gap: 9, cursor: "pointer" }} onClick={onOpenAdd}>
                <div
                  style={{
                    width: 150,
                    height: 200,
                    border: "2px dashed var(--border)",
                    borderRadius: 9,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <Plus className="lucide" style={{ width: 20, height: 20 }} />
                </div>
                <div style={{ font: "500 12.5px var(--font-sans)", color: "var(--muted-foreground)" }}><Trans>Add new book</Trans></div>
              </div>
              {recents.map((b) => (
                <div
                  key={b.label}
                  style={{ width: 150, flex: "none", display: "flex", flexDirection: "column", gap: 9, cursor: "pointer" }}
                  onClick={() => openBook(b.label)}
                >
                  <div className="covbox" style={{ width: 150, height: 200, borderRadius: 9, boxShadow: "var(--shadow-md)" }}>
                    <BookCover title={b.displayTitle} author={b.authors} cover={b.cover} />
                  </div>
                  <div>
                    <div style={{ font: "600 12.5px/1.25 var(--font-sans)", color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {b.displayTitle}
                    </div>
                    <div style={{ font: "400 11.5px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {b.authors} · {b.pagesText}
                    </div>
                    {b.hasStages && (
                      <div style={{ marginTop: 8 }}>
                        <DiscRow discs={b.discs.slice(0, 5)} size={18} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
