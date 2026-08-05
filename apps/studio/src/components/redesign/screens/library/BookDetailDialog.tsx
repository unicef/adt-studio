import { useNavigate } from "@tanstack/react-router"
import { TriangleAlert, HardDrive, FolderUp, ArrowRight, Trash2 } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BookCover } from "../../BookCover"
import { StagePill } from "../../ui/StagePill"
import type { BookVM } from "../../data"

const PILL = "gap-1 px-2 text-[10.5px]"

export interface BookDetailDialogProps {
  book: BookVM | null
  onOpenChange: (open: boolean) => void
  onEdit: (label: string) => void
  onDelete: (label: string) => void
}

export function BookDetailDialog({ book, onOpenChange, onEdit, onDelete }: BookDetailDialogProps) {
  const navigate = useNavigate()
  const goStep = (step: "preview" | "export") =>
    book && navigate({ to: "/books/$label/$step", params: { label: book.label, step } })
  return (
    <Dialog open={book != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] gap-0 overflow-hidden p-0">
        {book && (
          <div className="flex max-h-[92vh] min-h-[470px]">
            <div
              className="grid w-[238px] shrink-0 place-items-center p-7"
              style={{ background: `linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.34)), ${book.cover.bg}` }}
            >
              <div
                className="h-[227px] w-[170px] overflow-hidden rounded-[10px]"
                style={{ boxShadow: "0 22px 46px -14px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.16)" }}
              >
                <BookCover title={book.displayTitle} author={book.authors} cover={book.cover} />
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-[26px] py-6">
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle className="pr-6 text-[19px] tracking-[-0.01em]">{book.displayTitle}</DialogTitle>
                <DialogDescription className="mt-1.5">
                  <Trans>
                    {book.authors} · {book.pagesText} · edited {book.modified}
                  </Trans>
                </DialogDescription>
              </DialogHeader>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {book.needsRebuild && (
                  <Badge variant="destructive" className={PILL}>
                    <TriangleAlert className="size-3" />
                    <Trans>Needs rebuild</Trans>
                  </Badge>
                )}
                <Badge variant="outline" className={PILL}>
                  {book.lang}
                </Badge>
                {book.hasStages && <StagePill discs={book.discs} />}
              </div>

              <div className="mt-4 flex flex-col items-start gap-2.5 rounded-xl border bg-muted px-3 py-2.5">
                <Badge variant="secondary" className={PILL}>
                  <HardDrive className="size-3" />
                  <Trans>Local only</Trans>
                </Badge>
                <span className="text-xs text-muted-foreground">
                  <Trans>Stored on this computer — share it by exporting a .zip</Trans>
                </span>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => goStep("export")}>
                  <FolderUp className="size-3.5" />
                  <Trans>Export .zip</Trans>
                </Button>
              </div>

              <div className="mt-auto flex gap-2.5 pt-[22px]">
                <Button size="sm" onClick={() => onEdit(book.label)}>
                  <Trans>Continue editing</Trans>
                  <ArrowRight className="size-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => goStep("preview")}>
                  <Trans>Preview</Trans>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(book.label)}
                  className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  <Trans>Delete</Trans>
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
