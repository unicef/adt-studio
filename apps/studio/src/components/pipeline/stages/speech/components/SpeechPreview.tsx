import { AudioLines, Mic2, Play } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function SpeechPreview({ wordHighlighting }: { wordHighlighting: boolean }) {
  /* eslint-disable lingui/no-unlocalized-strings -- sample preview text, illustrative only */
  const sentences: string[][] = [
    ["Lorem", "ipsum", "dolor", "sit", "amet,", "consectetur", "adipiscing", "elit."],
    ["Sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore."],
  ]
  /* eslint-enable lingui/no-unlocalized-strings */
  const activeSentence = 0
  const activeWord = 3

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden ">
      <div className="flex w-full h-full flex-col gap-4 px-5 py-5 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <Mic2 className="h-3.5 w-3.5 text-rose-700" strokeWidth={2} aria-hidden />
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-rose-700 leading-none">
              <Trans>Audio Player</Trans>
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-rose-500/80 leading-none">
            <Trans>Sample</Trans>
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border bg-background p-4 shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Play
              className="h-2.5 w-2.5 text-rose-500"
              strokeWidth={2}
              fill="none"
              aria-hidden
            />
            <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-rose-600 leading-none">
              {wordHighlighting ? (
                <Trans>Preview: Per-Word</Trans>
              ) : (
                <Trans>Preview: Per-Sentence</Trans>
              )}
            </span>
          </div>
          <p className="text-[13px] leading-[1.9] text-[#525252]">
            {sentences.map((sentenceWords, sIdx) => {
              const sentenceIsActive = sIdx === activeSentence
              const sentenceIsPast = sIdx < activeSentence
              return (
                <span key={sIdx}>
                  <span
                    className={cn(
                      "transition-colors duration-200",
                      !wordHighlighting && sentenceIsActive &&
                        "rounded-md px-1.5 py-0.5 ring-1 ring-rose-400 text-foreground",
                        !wordHighlighting && sentenceIsPast && "text-foreground",
                    )}
                  >
                    {sentenceWords.map((w, wIdx) => {
                      const wordIsActive =
                        wordHighlighting && sentenceIsActive && wIdx === activeWord
                      const wordIsPast =
                        wordHighlighting &&
                        (sentenceIsPast ||
                          (sentenceIsActive && wIdx < activeWord))
                      return (
                        <span key={wIdx}>
                          <span
                            className={cn(
                              "transition-colors duration-200",
                              wordIsActive &&
                                "rounded-sm bg-rose-200/70 px-0.5 font-semibold text-rose-900",
                              wordIsPast && "text-foreground",
                            )}
                          >
                            {w}
                          </span>
                          {wIdx < sentenceWords.length - 1 && " "}
                        </span>
                      )
                    })}
                  </span>
                  {sIdx < sentences.length - 1 && " "}
                </span>
              )
            })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 shadow-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-white">
            <Play className="h-3.5 w-3.5 ml-0.5" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="flex flex-1 flex-col gap-1">
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
              <span
                className="absolute left-0 top-0 h-full rounded-full bg-rose-600"
                style={{ width: "38%" }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] font-medium tabular-nums text-[#737373]">
              <span>0:18</span>
              <span>0:47</span>
            </div>
          </div>
          <AudioLines
            className="h-4 w-4 text-rose-400 motion-safe:animate-pulse"
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </div>
    </div>
  )
}
