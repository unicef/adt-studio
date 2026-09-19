import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Scissors, Inbox, FolderDown } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CoordinatorEmpty() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/40 px-6 py-12 text-center">
      <span className="grid size-[52px] place-items-center rounded-[13px] bg-brand-50 text-brand-600">
        <Scissors className="size-6" />
      </span>
      <div className="mt-4 text-[15px] font-semibold"><Trans>You haven&apos;t split any books</Trans></div>
      <p className="mx-auto mt-1 max-w-[420px] text-[13px] text-muted-foreground">
        <Trans>Split a book into page-range parts to process on a lighter machine, or hand parts off to collaborators — then merge them back.</Trans>
      </p>
      <Button className="mt-5" onClick={() => navigate({ to: "/books/new" })}>
        <Scissors className="size-3.5" /> <Trans>Split a book</Trans>
      </Button>
    </div>
  )
}

export function EditorEmpty() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/40 px-6 py-9 text-center">
      <span className="grid size-[52px] place-items-center rounded-[13px] bg-muted text-muted-foreground">
        <Inbox className="size-6" />
      </span>
      <div className="mt-3.5 text-[14px] font-semibold"><Trans>No parts shared with you</Trans></div>
      <p className="mx-auto mt-1 max-w-[380px] text-[12.5px] text-muted-foreground">
        <Trans>When someone sends you a part of their book to work on, it shows up here to open, process, and return.</Trans>
      </p>
      <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/books/import" })}>
        <FolderDown className="size-3.5" /> <Trans>Import a part .zip</Trans>
      </Button>
    </div>
  )
}
