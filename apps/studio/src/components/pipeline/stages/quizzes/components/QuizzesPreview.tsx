import { Trans } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n as linguiI18n } from "@lingui/core"
import type { MessageDescriptor } from "@lingui/core"

const SAMPLE_QUESTION = msg`What is the main role of a plant's roots?`

const SAMPLE_OPTIONS: MessageDescriptor[] = [
  msg`They absorb water and nutrients from the soil.`,
  msg`They produce flowers to attract pollinators.`,
  msg`They release oxygen directly into the air.`,
]

export function QuizzesPreview({
  pagesPerQuiz,
  mode = "frequency",
}: {
  pagesPerQuiz: number
  mode?: "frequency" | "specific"
}) {
  const frequency = Number.isFinite(pagesPerQuiz) && pagesPerQuiz > 0 ? pagesPerQuiz : 3

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden ">
      <span className="absolute right-4 top-4 z-10 rounded-full border border-border bg-orange-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-orange-700">
        <Trans>Sample</Trans>
      </span>

      <div className="flex w-full h-full flex-col items-center justify-center gap-5 overflow-auto px-6 py-8 min-h-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a3a3a3]">
          {mode === "specific" ? (
            <Trans>Single quiz</Trans>
          ) : (
            <Trans>1 quiz / {frequency} pages</Trans>
          )}
        </span>

        <div className="flex w-full max-w-sm flex-col items-center">
          <header className="text-center">
            <p className="text-base font-bold leading-snug tracking-tight text-foreground">
              {linguiI18n._(SAMPLE_QUESTION)}
            </p>
          </header>

          <div className="mt-6 flex w-full flex-col items-center gap-3" role="group">
            {SAMPLE_OPTIONS.map((option, i) => (
              <div
                key={i}
                className="w-full rounded-2xl border-2 border-border bg-background px-5 py-3 text-center shadow-[0_4px_0_0_rgba(0,0,0,0.65)] transition-all motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
              >
                <span className="block text-sm font-medium text-foreground">
                  {linguiI18n._(option)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-7">
            <span className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm">
              <Trans>Submit</Trans>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
