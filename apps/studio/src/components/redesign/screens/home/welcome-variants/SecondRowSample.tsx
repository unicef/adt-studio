import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { BookOpen, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PreviewArt } from "./parts"

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
      <div className="mb-3 mt-[22px]">
        <div className="text-[15px] font-bold">
          <Trans>See it in action</Trans>
        </div>
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">
          <Trans>Explore a finished book — audio, captions and translations — before converting your own.</Trans>
        </div>
      </div>

      <div className="grid grid-cols-1 items-center gap-6 rounded-2xl border bg-gradient-to-br from-brand-50 to-card p-6 lg:grid-cols-2">
        <div className="grid place-items-center py-2">
          <PreviewArt />
        </div>
        <div>
          <Badge variant="info" className="gap-1 px-2 text-[10.5px] uppercase tracking-[0.06em]">
            <Sparkles className="size-3" />
            <Trans>Sample book</Trans>
          </Badge>
          <h3 className="mt-3 max-w-[360px] text-lg font-bold leading-[1.2] tracking-[-0.01em]">
            <Trans>A real converted textbook, ready to explore.</Trans>
          </h3>
          <p className="mt-2 max-w-[400px] text-[13px] leading-relaxed text-muted-foreground">
            <Trans>Open it to hear the narration, read the AI captions, switch languages and try a quiz — then convert your own PDF when you&apos;re ready.</Trans>
          </p>
          <div className="mt-4 flex gap-2.5">
            <Button onClick={() => navigate({ to: "/books/new" })}>
              <BookOpen className="size-3.5" />
              <Trans>Open a sample book</Trans>
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/books/new" })}>
              <Trans>or add your own PDF</Trans>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
