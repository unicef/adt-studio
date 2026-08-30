import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { KeyRound, MessagesSquare } from "lucide-react"

const STARTERS: MessageDescriptor[] = [
  msg`What is this book about?`,
  msg`Which stages still need to run?`,
  msg`Summarise the sections on this page`,
]

export interface ChatEmptyStateProps {
  hasModel: boolean
  onStarter: (prompt: string) => void
}

export function ChatEmptyState({ hasModel, onStarter }: ChatEmptyStateProps) {
  const { i18n } = useLingui()

  if (!hasModel) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-3.5 py-8 text-center">
        <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
          <KeyRound aria-hidden="true" className="size-4" />
        </span>
        <span className="text-[12.5px] font-semibold">
          <Trans>No model available</Trans>
        </span>
        <span className="text-pretty text-[11.5px] leading-relaxed text-muted-foreground">
          <Trans>
            Add an OpenAI, Anthropic or Google API key in Settings → Providers to chat
            about this book.
          </Trans>
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 px-3.5 py-6">
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-2 py-6 text-center">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <MessagesSquare aria-hidden="true" className="size-4" />
        </span>
        <span className="text-[12.5px] font-semibold">
          <Trans>Ask about this book</Trans>
        </span>
        <span className="text-pretty text-[11.5px] leading-relaxed text-muted-foreground">
          <Trans>
            The assistant can read the book and propose changes. Every change is shown
            for approval before it runs.
          </Trans>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Trans>Start with</Trans>
        </span>
        {STARTERS.map((starter) => {
          const prompt = i18n._(starter)
          return (
            <button
              key={starter.id ?? String(starter.message)}
              type="button"
              onClick={() => onStarter(prompt)}
              className="rounded-[9px] border px-3 py-2 text-left text-xs text-foreground transition-[background-color,border-color,scale] duration-150 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.96] motion-reduce:transition-none"
            >
              “{prompt}”
            </button>
          )
        })}
      </div>
    </div>
  )
}
