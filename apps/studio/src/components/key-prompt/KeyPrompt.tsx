import type { ReactNode } from "react"
import { KeyRound, ShieldAlert } from "lucide-react"
import { select } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { providerSelectKey } from "@/i18n/provider-select-key"
import { Button } from "@/components/ui/button"

/** Welcome screen: connecting a provider comes first, then the book. `ctas` are the add/import buttons. */
export function WelcomeKeyPrompt({ onConnect, ctas }: { onConnect: () => void; ctas: ReactNode }) {
  return (
    <>
      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground">
        <KeyRound className="size-4 text-brand-600" aria-hidden />
        <span>
          <Trans>Connect your AI provider to process books.</Trans>
        </span>
        <button
          type="button"
          onClick={onConnect}
          className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
        >
          <Trans>Connect provider</Trans>
        </button>
      </p>
      <div className="flex flex-wrap gap-3">{ctas}</div>
    </>
  )
}

/** Welcome screen: the provider is set up but refuses its key. `ctas` are the add/import buttons. */
export function WelcomeRejectedKeyPrompt({
  providerId,
  name,
  onUpdate,
  ctas,
}: {
  /** Lets translations pick the article for the name (pt-BR: "da OpenAI", "do Google"). */
  providerId: string
  name: string
  onUpdate: () => void
  ctas: ReactNode
}) {
  const { t } = useLingui()
  const providerKey = providerSelectKey(providerId)
  return (
    <>
      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground">
        <ShieldAlert className="size-4 text-red-600" aria-hidden />
        <span>
          {t({ comment: "providerKey: openai, anthropic, google, gemini, azure, elevenlabs, custom, ollama, codex, claude_agent. Use it to pick a gendered article.", message: `${select(providerKey, { other: `Your ${name} key was rejected, so books can't be processed yet.` })}` })}
        </span>
        <button
          type="button"
          onClick={onUpdate}
          className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
        >
          <Trans>Update key</Trans>
        </button>
      </p>
      <div className="flex flex-wrap gap-3">{ctas}</div>
    </>
  )
}

/** Book overview and Extract pages: why AI steps cannot run, with the fix. */
export function MissingKeyBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-xl border bg-card px-4 py-3">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
      >
        <KeyRound className="size-4" />
      </span>
      <div className="min-w-[14rem] flex-1">
        <div className="text-[13.5px] font-semibold">
          <Trans>One step before you can run this</Trans>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
          <Trans>Extraction and the other AI steps run on your own AI provider.</Trans>
        </p>
      </div>
      <Button size="sm" className="ml-auto shrink-0" onClick={onConnect}>
        <Trans>Connect provider</Trans>
      </Button>
    </div>
  )
}

/** Book overview and stage pages: the provider is set up but refuses its key. */
export function RejectedKeyBanner({
  providerId,
  name,
  onUpdate,
}: {
  /** Lets translations pick the article for the name (pt-BR: "da OpenAI", "do Google"). */
  providerId: string
  name: string
  onUpdate: () => void
}) {
  const { t } = useLingui()
  const providerKey = providerSelectKey(providerId)
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-xl border border-red-200 bg-card px-4 py-3 dark:border-red-900"
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300"
      >
        <ShieldAlert className="size-4" />
      </span>
      <div className="min-w-[14rem] flex-1">
        <div className="text-[13.5px] font-semibold">
          {t({ comment: "providerKey: openai, anthropic, google, gemini, azure, elevenlabs, custom, ollama, codex, claude_agent. Use it to pick a gendered article.", message: `${select(providerKey, { other: `Your ${name} key was rejected` })}` })}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
          <Trans>AI steps will fail until the key is updated.</Trans>
        </p>
      </div>
      <Button size="sm" className="ml-auto shrink-0" onClick={onUpdate}>
        <Trans>Update key</Trans>
      </Button>
    </div>
  )
}
