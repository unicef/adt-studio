import { useContext, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeft, CircleHelp, X } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { FlowTopBar } from "@/components/FlowTopBar"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import { PdfChip } from "../PdfChip"
import { TopBarOptionsContext } from "./options"

const ICON_BUTTON = "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

/** Back to the library (✕ or "← Library"), after asking when a PDF was already chosen (nothing is saved yet). */
function LeaveButton({ hasFile, look }: { hasFile: boolean; look: "close" | "library" }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  const leave = () => navigate({ to: "/" })
  return (
    <>
      {look === "close" ? (
        <button type="button" onClick={() => (hasFile ? setAsking(true) : leave())} aria-label={t`Close`} title={t`Close`} className={ICON_BUTTON}>
          <X className="size-4" />
        </button>
      ) : (
        <button type="button" onClick={() => (hasFile ? setAsking(true) : leave())} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full pl-2 pr-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          <Trans>Library</Trans>
        </button>
      )}
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Leave without adding this book?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>The PDF and the choices so far aren&apos;t saved.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Stay</Trans>
            </AlertDialogCancel>
            <AlertDialogAction onClick={leave}>
              <Trans>Leave</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * The Add Book top bar: logo (back to the library), title, the PDF being set up, the language. The
 * dev lab compares where the PDF sits, a Close and a "?" button, and the bar's look.
 * `onHelp` replays the tour (null when it can't play: only on Upload, before a PDF).
 */
export function GuidedTopBar({ flow, contentWidth, onHelp }: { flow: UploadFlow; contentWidth: number; onHelp: (() => void) | null }) {
  const { t } = useLingui()
  const o = useContext(TopBarOptionsContext)
  const chip = <PdfChip flow={flow} look={o.pdfLook} change={o.change} />
  return (
    <FlowTopBar
      title={t`Add Book`}
      contentWidth={contentWidth}
      bordered={o.look === "border"}
      after={
        o.pdf === "title" && flow.file ? (
          <>
            <span aria-hidden className="text-muted-foreground/60">
              /
            </span>
            {chip}
          </>
        ) : null
      }
      actions={
        <>
          {o.pdf === "right" && chip}
          {o.help === "button" && onHelp && (
            <button type="button" onClick={onHelp} aria-label={t`Take the tour again`} title={t`Take the tour again`} className={ICON_BUTTON}>
              <CircleHelp className="size-4" />
            </button>
          )}
        </>
      }
      start={o.back === "library" ? <LeaveButton hasFile={!!flow.file} look="library" /> : null}
      end={o.back === "close" ? <LeaveButton hasFile={!!flow.file} look="close" /> : null}
    />
  )
}
