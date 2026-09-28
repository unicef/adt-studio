import { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { useNavigate } from "@tanstack/react-router"
import { BetaVersionsView } from "@/components/updates/beta/BetaVersionsView"
import { UpdateStateSurface } from "@/components/updates/UpdateStateSurface"
import { useAppVersion } from "@/hooks/use-app-version"
import { usePreviewBuild } from "@/hooks/use-preview-build"
import { useUpdateStatus } from "@/hooks/use-update-status"
import { SETTINGS_PATHS } from "./nav"
import { PreviewBuildBanner } from "./PreviewBuildBanner"
import { SettingsHeading, SettingsLead } from "./ui"

export function VersionsSection() {
  const currentVersion = useAppVersion()
  const navigate = useNavigate()
  const { status, cancel, install, installOnQuit } = useUpdateStatus()
  const preview = usePreviewBuild()
  const [switchTo, setSwitchTo] = useState<{ version: string; key: number }>()
  const installing =
    status.phase === "downloading" ||
    status.phase === "downloaded" ||
    status.phase === "installing"

  useEffect(() => {
    preview.acknowledge()
  }, [preview.acknowledge])

  return (
    <>
      <div className="shrink-0">
        <SettingsHeading>
          <Trans>Versions</Trans>
        </SettingsHeading>
        <SettingsLead>
          <Trans>
            Browse every beta release, read what changed, and switch to any of them — including
            an earlier one.
          </Trans>
        </SettingsLead>
      </div>

      {preview.status && !installing && (
        <PreviewBuildBanner
          status={preview.status}
          onSwitch={(version) => setSwitchTo((prev) => ({ version, key: (prev?.key ?? 0) + 1 }))}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
        {installing ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            <div className="w-full max-w-125 overflow-hidden rounded-xl ring-1 ring-border">
              <UpdateStateSurface
                status={status}
                currentVersion={currentVersion}
                onCancel={cancel}
                onInstallNow={install}
                onInstallLater={() => void installOnQuit()}
                onClose={() => void navigate({ to: SETTINGS_PATHS.about })}
              />
            </div>
          </div>
        ) : (
          <BetaVersionsView
            key={switchTo?.key}
            status={status}
            currentVersion={currentVersion}
            initialVersion={switchTo?.version}
          />
        )}
      </div>
    </>
  )
}
