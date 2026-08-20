import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Scissors, Users, GitMerge, ArrowRight, FolderDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/app/ui/EmptyState"

/** Split & merge first-run state (design 3a): the split → hand off → merge flow explainer. */
export function HandoffsEmptyState() {
  return (
    <div className="relative flex flex-1 items-center justify-center">
      <EmptyState
        className="w-full max-w-[460px]"
        illustration={
          <div aria-hidden className="mb-5 flex items-center justify-center gap-3">
            <span className="grid size-[52px] place-items-center rounded-[13px] bg-brand-50 text-brand-600">
              <Scissors className="size-6" />
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="grid size-[52px] place-items-center rounded-[13px] bg-muted text-muted-foreground">
              <Users className="size-6" />
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="grid size-[52px] place-items-center rounded-[13px] bg-stage-validation/10 text-stage-validation">
              <GitMerge className="size-6" />
            </span>
          </div>
        }
        title={<Trans>Nothing split yet</Trans>}
        description={<Trans>Split a book to share parts with collaborators — or import a part someone sent you to work on and return.</Trans>}
      >
        <Button asChild>
          <Link to="/books/new">
            <Scissors className="size-3.5" />
            <Trans>Split a book</Trans>
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/books/import">
            <FolderDown className="size-3.5" />
            <Trans>Import a part</Trans>
          </Link>
        </Button>
      </EmptyState>
    </div>
  )
}
