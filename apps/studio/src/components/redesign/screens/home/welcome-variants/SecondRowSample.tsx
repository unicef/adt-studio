import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PreviewArt } from "./parts"
import { SampleEyebrow, SecondRowHeader, SamplePanel } from "./SecondRowShell"

/**
 * Second-row option — "see it in action": open a finished sample book to experience the
 * output before converting your own PDF. Activation-first (sample-data pattern).
 *
 * NOTE: "Open a sample book" needs a bundled/loadable demo project; wired to the add flow
 * as a placeholder until that ships.
 */
export function SecondRowSample() {
  const navigate = useNavigate()
  return (
    <>
      <SecondRowHeader
        title={<Trans>See it in action</Trans>}
        description={<Trans>Explore a finished book — audio, captions and translations — before converting your own.</Trans>}
      />

      <SamplePanel className="grid grid-cols-1 items-center gap-6 p-6 lg:grid-cols-2">
        <div className="grid place-items-center py-2">
          <PreviewArt />
        </div>
        <div>
          <SampleEyebrow />
          <h4 className="mt-3 max-w-[360px] text-lg font-bold leading-tight tracking-[-0.01em]">
            <Trans>A real converted textbook, ready to explore.</Trans>
          </h4>
          <p className="mt-2 max-w-[400px] text-[13px] leading-relaxed text-muted-foreground">
            <Trans>Open it to hear the narration, read the AI captions, switch languages and try a quiz — then convert your own PDF when you&apos;re ready.</Trans>
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Button onClick={() => navigate({ to: "/books/new" })}>
              <BookOpen className="size-4" />
              <Trans>Open a sample book</Trans>
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/books/new" })}>
              <Trans>or add your own PDF</Trans>
            </Button>
          </div>
        </div>
      </SamplePanel>
    </>
  )
}
