import { ArrowDown, PencilLine, ToggleRight, History } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useRunEasyRead } from "./use-run-easy-read"

export function EasyReadLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { runEasyRead, hasApiKey } = useRunEasyRead(bookLabel)
  const status = useStageStatus("easy-read")
  const storyboardReady = useStageStatus("storyboard").isCompleted

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to generate Easy Read content.</Trans>
  ) : !storyboardReady ? (
    <Trans>Run Storyboard first — Easy Read simplifies the text it places on each page.</Trans>
  ) : undefined

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="easy-read"
      settingsTab="general"
      colorClass="bg-fuchsia-600 hover:bg-fuchsia-700"
      accentColor="#c026d3"
      accentColorSoft="#fae8ff"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey || !storyboardReady}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Easy Read</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Easy Read Preview`}
      onRun={() => void runEasyRead()}
      preview={<EasyReadPreview />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Easy Read</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Generate a simplified, easier-to-read version of every text block in
            the book. Readers turn it on with the Easy Read toggle in the ADT;
            you can review and edit each simplified block before packaging.
          </Trans>
        </p>
      </div>

      <PrereqGuard
        upstreamSlug="storyboard"
        stageSlug="easy-read"
        description={
          <Trans>
            Easy Read adapts the text placed on each page by Storyboard. Finish
            Storyboard before running this stage.
          </Trans>
        }
      />

      <div className="flex flex-col gap-2.5">
        <FeatureRow
          icon={<ToggleRight className="h-4 w-4" strokeWidth={2} aria-hidden />}
          title={<Trans>Reader-controlled</Trans>}
          body={<Trans>Readers switch between the original and simplified text with the Easy Read toggle.</Trans>}
        />
        <FeatureRow
          icon={<PencilLine className="h-4 w-4" strokeWidth={2} aria-hidden />}
          title={<Trans>Editable per block</Trans>}
          body={<Trans>Review and refine each simplified block side-by-side with the original before packaging.</Trans>}
        />
        <FeatureRow
          icon={<History className="h-4 w-4" strokeWidth={2} aria-hidden />}
          title={<Trans>Versioned</Trans>}
          body={<Trans>Every edit and re-run is saved as a new version, so you can always roll back.</Trans>}
        />
      </div>

      <p className="text-[13px] text-[#737373] leading-relaxed">
        <Trans>
          Tune how text is simplified in the Easy Read Prompt settings. After
          running, each block becomes editable here in the Easy Read step.
        </Trans>
      </p>
    </LandingPageShell>
  )
}

function FeatureRow({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  body: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-fuchsia-100 bg-fuchsia-50/40 px-3.5 py-3 transition-colors duration-200 hover:border-fuchsia-200 hover:bg-fuchsia-50">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fuchsia-100 text-fuchsia-700">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-[#0a0a0a]">{title}</span>
        <p className="text-[12px] leading-relaxed text-[#737373]">{body}</p>
      </div>
    </div>
  )
}

/** Static illustrative preview: original text on top, simplified below. */
function EasyReadPreview() {
  return (
    <div className="flex h-full flex-col gap-3 p-5 text-left">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#a3a3a3]">
          <Trans>Easy Read</Trans>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-medium text-fuchsia-700">
          <ToggleRight className="h-3 w-3" aria-hidden />
          <Trans>On</Trans>
        </span>
      </div>

      <div className="rounded-md border border-[#e5e5e5] bg-[#fafafa] p-3">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#a3a3a3]">
          <Trans>Original</Trans>
        </p>
        <p className="text-[12px] leading-relaxed text-[#525252]">
          <Trans>
            Despite the inclement weather, the expedition pressed on toward the
            summit, undeterred by the mounting obstacles in their path.
          </Trans>
        </p>
      </div>

      <div className="flex items-center justify-center text-fuchsia-300" aria-hidden>
        <ArrowDown className="h-4 w-4" />
      </div>

      <div className="rounded-md border border-fuchsia-200 bg-fuchsia-50 p-3">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fuchsia-700">
          <Trans>Easy Read</Trans>
        </p>
        <div className="flex flex-col gap-1 text-[13px] leading-relaxed text-[#0a0a0a]">
          <span><Trans>The weather was very bad.</Trans></span>
          <span><Trans>But the team kept walking up the mountain.</Trans></span>
          <span><Trans>They did not give up.</Trans></span>
        </div>
      </div>
    </div>
  )
}
