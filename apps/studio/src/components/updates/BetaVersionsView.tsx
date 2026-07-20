import { Trans, useLingui } from "@lingui/react/macro"
import { FlaskConical } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { DialogTitle } from "@/components/ui/dialog"
import type { AvailableRelease, UpdateStatus } from "@/hooks/use-update-status"
import {
  useBetaUpdateVersions,
  useInstallBetaVersion,
} from "@/hooks/use-beta-update-versions"
import { BetaVersionActions } from "./BetaVersionActions"
import { BetaVersionDetails } from "./BetaVersionDetails"
import { BetaVersionSidebar } from "./BetaVersionSidebar"
import { ReleaseSourceCard } from "./ReleaseSourceCard"

interface BetaVersionsViewProps {
  status: UpdateStatus
  currentVersion?: string | null
  onClose: () => void
}

const EMPTY_RELEASES: AvailableRelease[] = []

export function BetaVersionsView({
  status,
  currentVersion,
  onClose,
}: BetaVersionsViewProps) {
  const { i18n } = useLingui()
  const [selectedVersion, setSelectedVersion] = useState<string>()
  const versionsQuery = useBetaUpdateVersions(currentVersion)
  const installMutation = useInstallBetaVersion()
  const versions = versionsQuery.data ?? EMPTY_RELEASES
  const loading = versionsQuery.isPending
  const refreshing = versionsQuery.isFetching && !loading
  const preparing = installMutation.isPending
  const detectedVersion =
    status.phase === "available" ? status.version : undefined

  useEffect(() => {
    setSelectedVersion((previous) => {
      if (
        previous &&
        versions.some((release) => release.version === previous)
      ) {
        return previous
      }
      return (
        versions.find((release) => release.version === detectedVersion)
          ?.version ??
        versions.find((release) => release.direction === "upgrade")?.version ??
        versions.find((release) => release.direction === "current")?.version ??
        versions[0]?.version
      )
    })
  }, [detectedVersion, versions])

  const selected = useMemo(
    () => versions.find((release) => release.version === selectedVersion),
    [selectedVersion, versions],
  )

  const startInstall = () => {
    if (!selected || selected.direction === "current") return
    installMutation.mutate(selected.version)
  }

  const requestError = installMutation.error ?? versionsQuery.error
  const error = requestError
    ? requestError instanceof Error
      ? requestError.message
      : String(requestError)
    : undefined

  return (
    <div className="flex h-[clamp(34rem,76dvh,50rem)] max-h-[calc(100dvh-2rem)] flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b px-4 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <FlaskConical className="size-4" aria-hidden="true" />
        </div>
        <DialogTitle className="text-balance text-sm font-semibold">
          <Trans>Beta versions</Trans>
        </DialogTitle>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[16rem_minmax(0,1fr)_18rem] xl:grid-cols-[17rem_minmax(0,1fr)_20rem]">
        <BetaVersionSidebar
          versions={versions}
          selectedVersion={selectedVersion}
          loading={loading}
          fetching={versionsQuery.isFetching}
          refreshing={refreshing}
          interactionDisabled={preparing}
          onSelect={setSelectedVersion}
          onRefresh={() => void versionsQuery.refetch()}
        />
        <div className="flex min-h-0 flex-col">
          <BetaVersionDetails
            release={selected}
            locale={i18n.locale}
            error={error}
          />
          <BetaVersionActions
            release={selected}
            preparing={preparing}
            checking={status.phase === "checking"}
            onClose={onClose}
            onInstall={startInstall}
          />
        </div>
        <ReleaseSourceCard source={selected?.source} />
      </div>
    </div>
  )
}

export {
  filterVersionsByQuery,
  groupVersionsByReleaseDate,
} from "./beta-version-utils"
