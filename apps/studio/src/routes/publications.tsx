import { createFileRoute } from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ErrorScreen } from "@/components/ErrorScreen"
import { StudioTopBar } from "@/components/StudioTopBar"
import { PublicationsDashboard } from "@/components/publications/PublicationsDashboard"
import { usePageTitle } from "@/hooks/use-page-title"

function PublicationsPage() {
  const { t } = useLingui()
  usePageTitle(t`Published books`)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <StudioTopBar brandLinksHome trailingTitle={<Trans>Published books</Trans>} />
      <PublicationsDashboard />
    </div>
  )
}

function PublicationsErrorComponent({ error, reset }: ErrorComponentProps) {
  return <ErrorScreen variant="route" error={error} reset={reset} />
}

export const Route = createFileRoute("/publications")({
  component: PublicationsPage,
  errorComponent: PublicationsErrorComponent,
})
