import { Trans } from "@lingui/react/macro"
import { Cloud } from "lucide-react"

/**
 * Nothing on this page can be chosen yet, so the panel does not show greyed settings to squint
 * at: the whole of it explains the one step that comes first, and what that step involves, so
 * "Set up sharing" is not a leap into the unknown. The three steps are the ones the setup wizard
 * itself shows.
 */
export function ConnectCallout() {
  const steps = [
    <Trans key="sign-in">Sign in at Cloudflare — it's free</Trans>,
    <Trans key="allow">Choose Allow when Cloudflare asks</Trans>,
    <Trans key="set-up">The Studio sets up the rest</Trans>,
  ]

  return (
    <div
      data-testid="publish-not-connected"
      className="flex flex-1 flex-col items-center justify-center gap-5 rounded-xl border border-orange-200 bg-orange-50/60 px-6 py-8 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-orange-200">
        <Cloud className="size-6 text-[#f6821f]" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-semibold tracking-tight text-foreground">
          <Trans>Connect Cloudflare to share</Trans>
        </p>
        <p className="mx-auto max-w-[17rem] text-sm leading-6 text-muted-foreground">
          <Trans>
            Books are shared from a free Cloudflare account of your own, connected once for the
            whole Studio.
          </Trans>
        </p>
      </div>
      <ol className="flex w-full max-w-[17rem] list-none flex-col gap-2.5 p-0 text-left">
        {steps.map((step, index) => (
          <li key={index} className="flex items-center gap-3 text-sm text-foreground">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#c2410c] ring-1 ring-orange-200">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}
