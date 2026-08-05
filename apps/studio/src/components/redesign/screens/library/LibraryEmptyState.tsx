import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Plus, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "../../ui/EmptyState"
import { GhostCover } from "../../ui/GhostCover"
import { BookCover } from "../../BookCover"

export interface LibraryEmptyStateProps {
  onOpenAdd: () => void
}

export function LibraryEmptyState({ onOpenAdd }: LibraryEmptyStateProps) {
  const navigate = useNavigate()
  const { t } = useLingui()
  return (
    <div className="relative flex flex-1 items-center justify-center">
      <EmptyState
        className="w-full max-w-[420px]"
        illustration={
          <div className="relative mx-auto mb-1.5 w-56 h-60">
            <GhostCover className="absolute left-3.5 top-[18px] -rotate-[9deg] opacity-50" />
            <GhostCover className="absolute right-3.5 top-3.5 rotate-[8deg] opacity-50" />
            <div className="absolute left-1/2 top-2 h-56 w-42 -translate-x-1/2 overflow-hidden rounded-[9px] shadow-[0_30px_60px_-20px_rgba(43,127,255,0.25),0_4px_14px_rgba(0,0,0,0.08)]">
              <BookCover
                title={t`Your book`}
                author=""
                cover={{ bg: "#1e40af", fg: "#ffffff", accent: "#7dd3fc", publisherShort: t`ADT STUDIO`, placeholder: false, real: true }}
              />
            </div>
          </div>
        }
        title={<Trans>Add your first book</Trans>}
        description={<Trans>Upload a PDF to get started. Everything you create lands here, ready for the pipeline.</Trans>}
      >
        <Button onClick={onOpenAdd}>
          <Plus className="size-3.5" />
          <Trans>Add book</Trans>
        </Button>
        <Button variant="outline" onClick={() => navigate({ to: "/books/import" })}>
          <Upload className="size-3.5" />
          <Trans>Import project</Trans>
        </Button>
      </EmptyState>
    </div>
  )
}
