import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { CloudOff, Link2Off, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Cover, type ShareBook } from "./Cover"
import { FadeSwap } from "./Reveal"
import type { ShareForm } from "./useShareForm"
import { includeStage } from "./SettingsFields"

export type PreviewMode = "gate" | "locked" | "stopped" | "unknown"

/**
 * The first screen a reader meets, drawn from the choices on the left.
 *
 * It is the reason this layout exists: every setting on this page is a decision about a reader,
 * and a reader is easier to picture than a radio button. So it never shows anything the reader
 * would not — when sharing is stopped it shows the closed page they would get, and before an
 * account is connected it shows the gate greyed, because there is no reader yet.
 */
export function ReaderPreview({
  book,
  form,
  mode,
  url,
}: {
  book: ShareBook
  form: ShareForm
  mode: PreviewMode
  /** The address readers already have. Only a stopped link has one before sharing. */
  url?: string | null
}) {
  const { t } = useLingui()
  const muted = mode === "locked" || mode === "unknown"

  return (
    <section
      data-testid="publish-reader-preview"
      data-mode={mode}
      aria-label={t`What a reader sees`}
      className="flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-[#f6f7f9] shadow-sm"
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-4">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]/70" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/70" />
          <span className="size-2.5 rounded-full bg-[#28c840]/70" />
        </span>
        <span className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted/70 px-3 text-xs text-muted-foreground">
          {mode === "stopped" ? (
            <Link2Off className="size-3 shrink-0" aria-hidden="true" />
          ) : (
            <Lock className="size-3 shrink-0" aria-hidden="true" />
          )}
          <span className={cn("min-w-0 truncate", url && "font-mono")}>
            {url ? url.replace(/^https:\/\//, "") : <Trans>Your link appears here once the book is shared</Trans>}
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
          <Trans>Reader's view</Trans>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-8 [@media(max-height:820px)]:p-5">
        <p className="sr-only">
          {mode === "stopped" ? (
            <Trans>Readers see that the book isn't being shared right now.</Trans>
          ) : form.access === "code" ? (
            <Trans>Readers see the cover and type the code before the book opens.</Trans>
          ) : (
            <Trans>Readers see the cover and open the book straight away.</Trans>
          )}
        </p>
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none m-auto flex w-full max-w-[25rem] cursor-default select-none flex-col items-center rounded-2xl bg-white px-7 py-8 text-center [@media(max-height:820px)]:py-6 shadow-sm ring-1 ring-black/5",
            "transition-opacity duration-300 motion-reduce:transition-none",
            muted && "opacity-55",
          )}
        >
          <FadeSwap id={mode === "stopped" ? "closed" : "gate"} className="flex w-full flex-col items-center">
            {mode === "stopped" ? <ClosedPage book={book} /> : <Gate book={book} form={form} />}
          </FadeSwap>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center justify-center gap-1.5 border-t bg-white px-4 text-xs text-muted-foreground">
        <Footer form={form} mode={mode} />
      </div>
    </section>
  )
}

function Gate({ book, form }: { book: ShareBook; form: ShareForm }) {
  const withCode = form.access === "code"
  return (
    <>
      <Cover
        book={book}
        className={cn(
          "w-auto transition-[height] duration-500 ease-out motion-reduce:transition-none",
          withCode ? "h-36 [@media(max-height:820px)]:h-24" : "h-52 [@media(max-height:820px)]:h-36",
        )}
      />
      <p className="mt-4 line-clamp-2 text-base font-semibold leading-snug text-foreground">{book.title}</p>

      <div
        className={cn(
          "grid w-full transition-[grid-template-rows,opacity,margin] duration-500 ease-out motion-reduce:transition-none",
          withCode ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <p className="text-sm text-muted-foreground"><Trans>Type the code you were given</Trans></p>
          <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: Math.min(Math.max(form.code.length, 4), 12) }, (_, index) => (
              <span key={index} className="flex h-9 w-7 items-center justify-center rounded-md border bg-muted/30">
                <span className="size-1.5 rounded-full bg-muted-foreground/25" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-5 flex list-none flex-wrap justify-center gap-x-2.5 gap-y-1.5 p-0 text-[11px] text-muted-foreground">
        {form.includeRows.map((row) => {
          const stage = includeStage(row.key)
          const Icon = stage.icon
          const on = form.include[row.key]
          return (
            <li
              key={row.key}
              className={cn(
                "flex items-center gap-1 transition-opacity duration-300 motion-reduce:transition-none",
                on ? "opacity-100" : "line-through opacity-35",
              )}
            >
              <Icon className={cn("size-3", on && stage.textColor)} aria-hidden="true" />
              {row.label}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function ClosedPage({ book }: { book: ShareBook }) {
  return (
    <>
      <Cover book={book} className="h-36 w-auto opacity-60 grayscale [@media(max-height:820px)]:h-24" />
      <p className="mt-4 line-clamp-2 text-base font-semibold leading-snug text-foreground">{book.title}</p>
      <p className="mt-4 flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        <CloudOff className="size-3.5" aria-hidden="true" />
        <Trans>Not being shared right now</Trans>
      </p>
      <p className="mt-3 max-w-[16rem] text-xs leading-5 text-muted-foreground">
        <Trans>Ask the person who sent you this link to share it again.</Trans>
      </p>
    </>
  )
}

function Footer({ form, mode }: { form: ShareForm; mode: PreviewMode }): ReactNode {
  if (mode === "locked") return <Trans>Readers will see this once an account is connected.</Trans>
  if (mode === "unknown") return <Trans>This comes back once the Studio can check the book.</Trans>
  if (mode === "stopped") return <Trans>Resuming brings readers back to this same link.</Trans>
  return form.expiryDate ? (
    <Trans>The link stops opening on {form.expiryDate}.</Trans>
  ) : (
    <Trans>The link keeps working until you stop sharing.</Trans>
  )
}
