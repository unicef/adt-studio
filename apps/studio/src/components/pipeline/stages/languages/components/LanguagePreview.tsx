import { ArrowRight, Languages } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { displayLang } from "../lib/display-lang"

export function LanguagePreview({
  baseLanguage,
  outputLanguages,
  imageCount,
}: {
  baseLanguage: string
  outputLanguages: string[]
  imageCount: number
}) {
  const imagesEnabled = imageCount > 0
  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden ">
      <div className="flex w-full h-full flex-col gap-4 px-5 py-5 min-h-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <Languages className="h-3.5 w-3.5 text-pink-700" strokeWidth={2} aria-hidden />
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-pink-700 leading-none">
            <Trans>Translation Plan</Trans>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-card text-foreground">
            <Languages className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
              <Trans>Source</Trans>
            </span>
            <span className="text-[13px] font-semibold text-foreground">
              {displayLang(baseLanguage)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 justify-center">
          <ArrowRight className="h-3.5 w-3.5 text-pink-400 rotate-90" strokeWidth={2} aria-hidden />
        </div>

        <div className="flex flex-1 min-h-0 flex-col gap-1.5 overflow-hidden">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-pink-700">
            <Trans>{outputLanguages.length} translations</Trans>
          </span>
          {outputLanguages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-pink-200 bg-background/60 px-3 py-6 text-center text-[11.5px] text-pink-700/70">
              <Trans>Add a language to see translations appear here.</Trans>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {outputLanguages.map((code) => (
                <li
                  key={code}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-pink-100 text-[10px] font-semibold uppercase text-pink-700">
                    {code.split("-")[0]}
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-foreground">
                    {displayLang(code)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[10.5px] transition-colors",
            imagesEnabled
              ? "bg-pink-50 text-pink-700"
              : "bg-[#f5f5f5] text-[#737373]",
          )}
        >
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              imagesEnabled ? "bg-pink-500" : "bg-[#a3a3a3]",
            )}
            aria-hidden
          />
          {imagesEnabled ? (
            <Trans>
              {imageCount} image{imageCount === 1 ? "" : "s"} will be
              translated
            </Trans>
          ) : (
            <Trans>Images stay in the source language</Trans>
          )}
        </div>
      </div>
    </div>
  )
}
