import { Plural, Trans } from "@lingui/react/macro"
import { Link } from "@tanstack/react-router"
import type { KidsInterfaceStatus } from "@adt/types"
import { ArrowRight, Languages, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import dinoEncouraging from "@kids-buddies/dino/dino_7.png"

interface KidsPreviewLanguageGateProps {
  bookLabel: string
  error: string
  status?: KidsInterfaceStatus
}

export function KidsPreviewLanguageGate({
  bookLabel,
  error,
  status,
}: KidsPreviewLanguageGateProps) {
  const incompleteLanguages =
    status?.languages.filter((language) => !language.ready) ?? []

  return (
    <div
      role="alert"
      aria-labelledby="kids-preview-gate-title"
      className="relative flex h-full min-h-[32rem] w-full items-center justify-center overflow-auto bg-[#F2F9FF] p-5 sm:p-8"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-12 h-32 w-56 rounded-full bg-[#DDF2FF]" />
        <div className="absolute -right-12 bottom-16 h-40 w-64 rounded-full bg-[#E5F5FF]" />
        <div className="absolute right-[12%] top-[12%] h-16 w-16 rounded-full bg-[#FFE58A]" />
      </div>

      <section className="relative grid w-full max-w-3xl overflow-hidden rounded-[2rem] border-2 border-[#B9DFF4] bg-[#FFFEFA] shadow-[0_8px_0_#C4DFF2] lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col p-6 sm:p-8 md:p-10 md:pr-6">
          <div className="mb-5 flex w-fit items-center gap-2 rounded-full bg-[#FFF3C4] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#765A00] ring-1 ring-inset ring-[#F2D66D]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <Trans>Kids Mode setup</Trans>
          </div>

          <h1
            id="kids-preview-gate-title"
            className="max-w-xl text-2xl font-extrabold leading-tight tracking-tight text-[#102A43] sm:text-3xl"
          >
            <Trans>Finish translating Kids Mode</Trans>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#486581] sm:text-[15px]">
            <Trans>
              Your book is ready, but its child-friendly controls are missing
              translations in some book languages. Complete them so the book
              and Kids Mode always speak the same language.
            </Trans>
          </p>

          {incompleteLanguages.length > 0 && (
            <div className="mt-6">
              <div
                id="kids-preview-missing-languages"
                className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#627D98]"
              >
                <Languages className="h-4 w-4" aria-hidden />
                <Trans>Languages to finish</Trans>
              </div>
              <ul
                className="flex flex-wrap gap-2"
                aria-labelledby="kids-preview-missing-languages"
              >
                {incompleteLanguages.map((language) => (
                  <li
                    key={language.language}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#B9DFF4] bg-[#EDF8FF] px-3 py-2 text-sm text-[#243B53]"
                  >
                    <span className="font-extrabold uppercase">
                      {language.language}
                    </span>
                    <span className="text-xs text-[#627D98]">
                      <Plural
                        value={language.missingKeys.length}
                        one="# message missing"
                        other="# messages missing"
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="h-11 rounded-xl bg-[#087FB8] px-5 font-bold text-[#F8FCFF] shadow-[0_3px_0_#075F88] hover:bg-[#076F9F] active:translate-y-0.5 active:shadow-none"
            >
              <Link
                to="/books/$label/kids"
                params={{ label: bookLabel }}
                search={{ returnTo: undefined }}
              >
                <Trans>Go to Kids Mode</Trans>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <p className="max-w-xs text-xs leading-5 text-[#627D98]">
              <Trans>
                Translate the interface there, then return to rebuild the
                preview.
              </Trans>
            </p>
          </div>

          <details className="mt-6 text-xs text-[#627D98]">
            <summary className="w-fit cursor-pointer rounded font-semibold underline decoration-[#9FB3C8] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087FB8] focus-visible:ring-offset-2">
              <Trans>View technical details</Trans>
            </summary>
            <p className="mt-2 max-w-xl whitespace-pre-wrap break-words rounded-lg bg-[#F4F7FA] px-3 py-2 font-mono text-[11px] leading-5 text-[#486581]">
              {error}
            </p>
          </details>
        </div>

        <div className="relative flex min-h-44 items-end justify-center overflow-hidden bg-[#E5F5FF] px-6 pt-5 lg:min-h-full lg:px-5 lg:pt-10">
          <div aria-hidden className="absolute left-5 top-5 h-12 w-20 rounded-full bg-[#F8FCFF] lg:left-3 lg:top-16" />
          <div aria-hidden className="absolute -right-5 top-12 h-16 w-28 rounded-full bg-[#F8FCFF]" />
          <div className="relative flex h-36 w-36 items-end justify-center rounded-full bg-[#FFF3C4] ring-2 ring-[#F2D66D] lg:h-44 lg:w-44">
            <img
              src={dinoEncouraging}
              alt=""
              width={176}
              height={176}
              className="h-[92%] w-[92%] object-contain"
            />
          </div>
        </div>
      </section>
    </div>
  )
}
