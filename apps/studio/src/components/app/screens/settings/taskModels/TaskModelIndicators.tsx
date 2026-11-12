import { useLingui } from "@lingui/react/macro"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Highlight } from "../models/search"

export const ICON_SWAP =
  "transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-opacity"

export function taskModelInputId(id: string): string {
  return `task-model-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`
}

export function CustomModelDot({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-brand-500",
        ICON_SWAP,
        active ? "scale-100 opacity-100" : "scale-[0.25] opacity-0",
        className,
      )}
    />
  )
}

export function PromptNames({
  prompts,
  query = "",
  className,
}: {
  prompts: string[]
  query?: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {prompts.map((prompt) => (
        <code
          key={prompt}
          className="max-w-full break-all rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[11.5px] leading-4 text-muted-foreground"
        >
          <Highlight text={prompt} query={query} />
        </code>
      ))}
    </div>
  )
}

export function ResetToDefaultButton({
  visible,
  label,
  disabled,
  onClick,
  className,
}: {
  visible: boolean
  label: string
  disabled: boolean
  onClick: () => void
  className?: string
}) {
  const { t } = useLingui()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-10 shrink-0 text-muted-foreground",
        ICON_SWAP,
        visible ? "scale-100 opacity-100 blur-0" : "pointer-events-none scale-[0.25] opacity-0 blur-[4px]",
        className,
      )}
      aria-label={t`Use the default LLM for ${label}`}
      title={t`Use the default LLM`}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      disabled={disabled}
      onClick={onClick}
    >
      <RotateCcw />
    </Button>
  )
}
