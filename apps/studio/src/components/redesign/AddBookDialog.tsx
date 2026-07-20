import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { FileText, ArrowRight, FileArchive, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export interface AddBookDialogProps {
  open: boolean
  onClose: () => void
}

export function AddBookDialog({ open, onClose }: AddBookDialogProps) {
  const navigate = useNavigate()

  const go = (to: "/books/new" | "/books/import") => {
    onClose()
    navigate({ to })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[660px] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 text-left">
          <DialogTitle className="text-[19px] tracking-[-0.01em]">
            <Trans>Add a book</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Two ways to start — from a source PDF, or from a project that already exists.</Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-6 pt-[18px]">
          <div
            onClick={() => go("/books/new")}
            className="relative flex cursor-pointer items-center gap-5 overflow-hidden rounded-2xl border-[1.5px] border-brand-300 bg-gradient-to-br from-brand-50 to-card p-5 transition hover:border-brand-500 hover:shadow-[0_0_0_3px_var(--brand-50)]"
          >
            <div className="flex shrink-0 items-center gap-3">
              <span className="grid size-[52px] place-items-center rounded-2xl bg-red-100 text-red-600">
                <FileText className="size-6" />
              </span>
              <ArrowRight className="size-[17px] shrink-0 text-brand-600" />
              <span className="grid size-[52px] place-items-center rounded-2xl border bg-white shadow-sm">
                <img src="/logo.png" className="size-9" alt="" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[16.5px] font-bold tracking-[-0.01em]">
                  <Trans>Convert a PDF</Trans>
                </span>
                <Badge className="rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-[0.06em]">
                  <Trans>Most common</Trans>
                </Badge>
              </div>
              <div className="mt-1 text-[12.5px] leading-[1.55] text-muted-foreground">
                <Trans>
                  Start a <b className="font-semibold text-foreground">new book</b> from a source PDF — ADT Studio creates a
                  fresh project and you run the pipeline stages on it.{" "}
                  <span className="font-mono text-[11px]">.pdf → new ADT project</span>
                </Trans>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                go("/books/new")
              }}
            >
              <Trans>Choose a PDF</Trans>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>

          <div
            onClick={() => go("/books/import")}
            className="flex cursor-pointer items-center gap-3.5 rounded-2xl border-[1.5px] bg-card px-5 py-3.5 transition hover:border-brand-400 hover:shadow-[0_0_0_3px_var(--brand-50)]"
          >
            <span className="relative grid size-10 shrink-0 place-items-center rounded-[11px] border bg-white shadow-sm">
              <img src="/logo.png" className="size-[27px]" alt="" />
              <span className="absolute -bottom-1.5 -right-1.5 grid size-[18px] place-items-center rounded-md border bg-muted text-muted-foreground">
                <FileArchive className="size-2.5" />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-[-0.01em]">
                <Trans>Import a project</Trans>
              </div>
              <div className="mt-0.5 text-xs leading-[1.5] text-muted-foreground">
                <Trans>
                  Open an ADT project that <b className="font-semibold text-foreground">already exists</b> — a backup, a book
                  part, or one exported by someone else. Nothing is converted.{" "}
                  <span className="font-mono text-[10.5px]">.zip → added as-is</span>
                </Trans>
              </div>
            </div>
            <ChevronRight className="size-[17px] shrink-0 text-muted-foreground" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
