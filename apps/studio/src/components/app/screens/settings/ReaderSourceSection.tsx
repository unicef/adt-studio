import { Trans } from "@lingui/react/macro"
import { ReaderWorkspace } from "@/components/pipeline/stages/reader/ReaderWorkspace/ReaderWorkspace"
import { useReaderWorkspace } from "@/components/pipeline/stages/reader/ReaderWorkspace/use-reader-workspace"
import { SettingsHeading, SettingsLead } from "./ui"

export function ReaderSourceSection() {
  const workspace = useReaderWorkspace(null)
  return (
    <>
      <div className="shrink-0">
        <SettingsHeading>
          <Trans>Global reader</Trans>
        </SettingsHeading>
        <SettingsLead>
          <Trans>
            Changes here reach every book that has not customized its own reader. Every save is a new version you can
            restore.
          </Trans>
        </SettingsLead>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border bg-card">
        <ReaderWorkspace workspace={workspace} />
      </div>
    </>
  )
}
