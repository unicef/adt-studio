import { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { useNavigate } from "@tanstack/react-router"
import { Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BetaVersionsView } from "@/components/updates/beta/BetaVersionsView"
import { formatVersion } from "@/components/updates/release-banner-utils"
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
  /** The downloaded version the author chose to install on quit: the page goes
   *  back to the list and says so, instead of holding the install panel. */
  const [deferredVersion, setDeferredVersion] = useState<string>()
  const deferred =
    status.phase === "downloaded" && status.version === deferredVersion ? status : undefined
  const readyVersion = deferred ? formatVersion(deferred.version) : ""
  const installing =
    status.phase === "downloading" ||
    (status.phase === "downloaded" && !deferred) ||
    status.phase === "installing"

  useEffect(() => {
    preview.acknowledge()
  }, [preview.acknowledge])

  return (
    <>
      <SettingsHeading>
        <Trans>Versions</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>
          Browse every beta release, read what changed, and switch to any of them — including
          an earlier one.
        </Trans>
      </SettingsLead>

      {preview.status && !installing && (
        <PreviewBuildBanner
          status={preview.status}
          onSwitch={(version) => setSwitchTo((prev) => ({ version, key: (prev?.key ?? 0) + 1 }))}
        />
      )}

      {status.phase === "error" && (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        >
          {status.message}
        </p>
      )}

      {deferred && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          <Clock className="size-5 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm">
            <Trans>
              {readyVersion} is downloaded and installs when you quit ADT Studio.
            </Trans>
          </p>
          <Button size="sm" onClick={() => void install()}>
            <Trans>Install now</Trans>
          </Button>
        </div>
      )}

      {installing ? (
        <div className="mx-auto w-full max-w-125 overflow-hidden rounded-2xl border bg-card shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          <UpdateStateSurface
            status={status}
            currentVersion={currentVersion}
            onCancel={cancel}
            onInstallNow={install}
            onInstallLater={() => {
              const version = status.phase === "downloaded" ? status.version : undefined
              // A failed request leaves the install panel up, so "Install later" can be tried again.
              void installOnQuit().then(
                () => setDeferredVersion(version),
                () => undefined,
              )
            }}
            onClose={() => void navigate({ to: SETTINGS_PATHS.about })}
          />
        </div>
      ) : (
        <BetaVersionsView
          key={switchTo?.key}
          status={status}
          currentVersion={currentVersion}
          initialVersion={switchTo?.version}
        />
      )}
    </>
  )
}
