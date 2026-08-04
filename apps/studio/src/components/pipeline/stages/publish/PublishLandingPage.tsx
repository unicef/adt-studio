import { Trans } from "@lingui/react/macro"
import { GitHubPublisher } from "../export/GitHubPublisher"

export function PublishLandingPage({ bookLabel }: { bookLabel: string }) {
  return (
    <main className="h-full overflow-y-auto bg-muted/10">
      <div className="flex w-full flex-col gap-5 px-5 py-5 sm:px-7 sm:py-7">
        <header className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
            <Trans>Publish</Trans>
          </h1>
          <p className="max-w-3xl text-[14px] leading-relaxed text-[#737373]">
            <Trans>
              Connect GitHub, review book changes, and publish the accessible
              book to GitHub Pages. Deployment progress and the live preview
              remain visible inside ADT Studio.
            </Trans>
          </p>
        </header>

        <GitHubPublisher bookLabel={bookLabel} />
      </div>
    </main>
  )
}
