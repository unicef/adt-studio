import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { X, FileText, ArrowRight, FileArchive, ChevronRight } from "lucide-react"

export interface AddBookDialogProps {
  open: boolean
  onClose: () => void
}

export function AddBookDialog({ open, onClose }: AddBookDialogProps) {
  const navigate = useNavigate()
  if (!open) return null

  const go = (to: "/books/new" | "/books/import") => {
    onClose()
    navigate({ to })
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.42)", zIndex: 200, display: "grid", placeItems: "center", padding: 28 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 660, maxWidth: "100%", background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--shadow-xl)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "22px 24px 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ font: "700 19px/1.2 var(--font-sans)", letterSpacing: "-0.01em", margin: 0 }}><Trans>Add a book</Trans></h2>
            <div style={{ font: "400 13px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 5 }}>
              <Trans>Two ways to start — from a source PDF, or from a project that already exists.</Trans>
            </div>
          </div>
          <button onClick={onClose} style={{ flex: "none", background: "none", border: 0, color: "var(--muted-foreground)", cursor: "pointer", display: "grid", placeItems: "center", padding: 3 }}>
            <X className="lucide" />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 24px 24px" }}>
          <div
            onClick={() => go("/books/new")}
            style={{ position: "relative", border: "1.5px solid var(--brand-300)", borderRadius: 14, background: "linear-gradient(160deg, var(--brand-50), var(--card) 55%)", padding: 20, display: "flex", alignItems: "center", gap: 20, cursor: "pointer", overflow: "hidden" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 11, flex: "none" }}>
              <span style={{ width: 52, height: 52, borderRadius: 14, background: "#fee2e2", color: "#dc2626", display: "grid", placeItems: "center", flex: "none" }}>
                <FileText className="lucide" style={{ width: 25, height: 25 }} />
              </span>
              <ArrowRight className="lucide" style={{ width: 17, height: 17, color: "var(--brand-600)", flex: "none" }} />
              <span style={{ width: 52, height: 52, borderRadius: 14, background: "#fff", border: "1px solid var(--border)", display: "grid", placeItems: "center", flex: "none", boxShadow: "var(--shadow-sm)" }}>
                <img src="/logo.png" style={{ width: 36, height: 36 }} alt="" />
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ font: "700 16.5px var(--font-sans)", letterSpacing: "-0.01em" }}><Trans>Convert a PDF</Trans></span>
                <span className="bdg" style={{ background: "var(--brand-600)", color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "9.5px" }}>
                  <Trans>Most common</Trans>
                </span>
              </div>
              <div style={{ font: "400 12.5px/1.55 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 4 }}>
                <Trans>
                  Start a <b style={{ color: "var(--foreground)", fontWeight: 600 }}>new book</b> from a source PDF — ADT Studio creates a fresh project and you run the pipeline stages on it.{" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>.pdf → new ADT project</span>
                </Trans>
              </div>
            </div>
            <button className="btn btn-pri" style={{ flex: "none", whiteSpace: "nowrap" }}>
              <Trans>Choose a PDF</Trans>
              <ArrowRight className="lucide" style={{ width: 14, height: 14 }} />
            </button>
          </div>

          <div
            onClick={() => go("/books/import")}
            style={{ border: "1.5px solid var(--border)", borderRadius: 14, background: "var(--card)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
          >
            <span style={{ position: "relative", width: 40, height: 40, borderRadius: 11, background: "#fff", border: "1px solid var(--border)", display: "grid", placeItems: "center", flex: "none", boxShadow: "var(--shadow-sm)" }}>
              <img src="/logo.png" style={{ width: 27, height: 27 }} alt="" />
              <span style={{ position: "absolute", right: -5, bottom: -5, width: 18, height: 18, borderRadius: 6, background: "var(--muted)", border: "1px solid var(--border)", display: "grid", placeItems: "center", color: "var(--muted-foreground)" }}>
                <FileArchive className="lucide" style={{ width: 10, height: 10 }} />
              </span>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 14px var(--font-sans)", letterSpacing: "-0.01em" }}><Trans>Import a project</Trans></div>
              <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 2 }}>
                <Trans>
                  Open an ADT project that <b style={{ color: "var(--foreground)", fontWeight: 600 }}>already exists</b> — a backup, a book part, or one exported by someone else. Nothing is converted.{" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px" }}>.zip → added as-is</span>
                </Trans>
              </div>
            </div>
            <ChevronRight className="lucide" style={{ width: 17, height: 17, color: "var(--muted-foreground)", flex: "none" }} />
          </div>
        </div>
      </div>
    </div>
  )
}
