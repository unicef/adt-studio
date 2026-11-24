import * as SelectPrimitive from "@radix-ui/react-select"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Sparkles } from "lucide-react"
import { Select, SelectContent, SelectGroup, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Choice, Setting } from "./setup"

function Item({ choice, suggested }: { choice: Choice; suggested: boolean }) {
  const { t } = useLingui()
  return (
    <SelectPrimitive.Item
      value={choice.value}
      className="relative flex w-full cursor-default select-none items-center gap-1.5 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{choice.title}</SelectPrimitive.ItemText>
      {suggested && (
        <span title={t`Suggested`} className="inline-flex text-brand-600">
          <Sparkles className="size-3.5" />
          <span className="sr-only">
            <Trans>Suggested</Trans>
          </span>
        </span>
      )}
    </SelectPrimitive.Item>
  )
}

/**
 * One AI setting as the app's own select: the trigger shows the current value (the wizard's name),
 * the list is a regular dropdown with a check on the current item and a small ✦ on the AI's pick.
 * Render strategies are grouped under "Template-based" / "AI-powered" (the AI pick's group first).
 */
export function SettingSelect({ setting, onPick, labelledBy, className }: { setting: Setting; onPick: (value: string) => void; labelledBy?: string; className?: string }) {
  const kinds = [...new Set(setting.choices.map((c) => c.kind).filter((k): k is NonNullable<Choice["kind"]> => !!k))]
  const aiKind = setting.choices.find((c) => c.value === setting.ai)?.kind
  const groups = kinds.length > 1 ? [...kinds].sort((a, b) => Number(b === aiKind) - Number(a === aiKind)).map((kind) => ({ kind, choices: setting.choices.filter((c) => c.kind === kind) })) : null
  return (
    <Select value={setting.value} onValueChange={onPick}>
      <SelectTrigger aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : typeof setting.label === "string" ? setting.label : undefined} className={cn("h-9 rounded-lg bg-card text-[14px] font-medium", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups
          ? groups.map((g, i) => (
              <SelectGroup key={g.kind}>
                {i > 0 && <SelectSeparator />}
                <SelectLabel className="py-1 pl-8 text-[11px] font-semibold text-muted-foreground">{g.kind === "ai" ? <Trans>AI-powered</Trans> : <Trans>Template-based</Trans>}</SelectLabel>
                {g.choices.map((c) => (
                  <Item key={c.value} choice={c} suggested={c.value === setting.ai} />
                ))}
              </SelectGroup>
            ))
          : setting.choices.map((c) => <Item key={c.value} choice={c} suggested={c.value === setting.ai} />)}
      </SelectContent>
    </Select>
  )
}
