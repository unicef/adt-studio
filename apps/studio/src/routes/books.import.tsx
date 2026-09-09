import { createFileRoute } from "@tanstack/react-router"
import { ImportProject } from "@/components/import/ImportProject"
import { FlowTopBar } from "@/components/FlowTopBar"
import { Trans, useLingui } from "@lingui/react/macro"
import { usePageTitle } from "@/hooks/use-page-title"

function ImportBookPage() {
  const { t } = useLingui()
  usePageTitle(t`Import Project`)
  return (
    <div className="flex flex-1 min-h-0 flex-col h-full bg-background">
      <FlowTopBar title={<Trans>Import Project</Trans>} />
      <div className="flex flex-1 min-h-0 flex-col overflow-auto">
        <ImportProject />
      </div>
    </div>
  )
}

export const Route = createFileRoute("/books/import")({
  component: ImportBookPage,
})
