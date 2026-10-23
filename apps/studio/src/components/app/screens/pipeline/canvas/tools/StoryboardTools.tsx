import type { ComponentType, ReactNode } from "react"
import * as Menu from "@radix-ui/react-dropdown-menu"
import { useLingui } from "@lingui/react/macro"
import { Check, Code, Copy, Eye, EyeOff, ListTree, MoreHorizontal, Puzzle, Table2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useCanvasEditing } from "../editing/CanvasEditing"
import { useStoryboardTools } from "./StoryboardToolsContext"

interface Tool {
  key: string
  icon: ComponentType<{ className?: string }>
  label: string
  detail: string | null
  blocked: string | null
  pending?: boolean
  pressed?: boolean
  run: () => void
}

const shellClass = "flex h-8 items-center gap-0.5 rounded-lg border bg-card/85 p-0.5 shadow-sm backdrop-blur-sm"
const iconButtonClass =
  "grid size-7 place-items-center rounded-md text-muted-foreground transition-[color,background-color,opacity] duration-150 hover:bg-muted hover:text-foreground aria-pressed:bg-amber-100 aria-pressed:text-amber-700 dark:aria-pressed:bg-amber-500/15 dark:aria-pressed:text-amber-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
const itemClass =
  "flex cursor-default items-start gap-2.5 rounded-md px-2 py-1.5 text-[13px] outline-none transition-[background-color,opacity] duration-150 data-[highlighted]:bg-muted data-[disabled]:opacity-55"

function useTools() {
  const { t } = useLingui()
  const editing = useCanvasEditing()
  const tools = useStoryboardTools()
  if (!tools) return null
  const { current, currentHasHtml, storyboardRunning, generating, agentAvailable, htmlOpen } = tools
  const sectionNumber = current ? current.sectionIndex + 1 : 0
  const busy = storyboardRunning
    ? t`Wait for the storyboard to finish building`
    : generating
      ? t`Wait for the activity to finish generating`
      : null
  const later = t`Not available yet`

  const prune: Tool = {
    key: "prune",
    icon: current?.isPruned ? Eye : EyeOff,
    label: current?.isPruned ? t`Restore section` : t`Prune section`,
    detail: current
      ? current.isPruned
        ? t`Put section ${sectionNumber} back in the reading flow`
        : t`Hide section ${sectionNumber} from the reading flow`
      : null,
    blocked: !current ? t`This page has no sections yet` : busy ?? (editing.saving ? t`Saving…` : null),
    pressed: !!current?.isPruned,
    run: () => current && editing.togglePruned(current.sectionIndex),
  }
  const html: Tool = {
    key: "html",
    icon: Code,
    label: t`HTML source`,
    detail: current ? t`Edit the markup of section ${sectionNumber}` : null,
    blocked: htmlOpen ? null : !current || !currentHasHtml ? t`This section has no rendered HTML yet` : generating ? busy : null,
    pressed: htmlOpen,
    run: () => tools.setHtmlOpen(!htmlOpen),
  }
  const mirror: Tool = { key: "mirror", icon: Copy, label: t`Mirror layout from…`, detail: null, blocked: later, pending: true, run: () => {} }
  const generate: Tool = {
    key: "generate",
    icon: Puzzle,
    label: t`Generate an activity…`,
    detail: t`Describe it and an agent adds it to this page`,
    blocked: !agentAvailable
      ? t`Connect an AI provider that can run agents in Settings`
      : busy ?? (editing.dirty || editing.saving ? t`Save or discard your changes first` : null),
    run: tools.openGenerate,
  }
  const overview: Tool = { key: "overview", icon: Table2, label: t`Overview`, detail: null, blocked: later, pending: true, run: () => {} }
  const outline: Tool = { key: "outline", icon: ListTree, label: t`Book outline`, detail: null, blocked: later, pending: true, run: () => {} }

  return {
    prune,
    groups: [
      { key: "section", label: t`This section`, tools: [html, mirror] },
      { key: "create", label: t`Create`, tools: [generate] },
      { key: "views", label: t`Views`, tools: [overview, outline] },
    ],
  }
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{children}</Menu.Label>
}

function ToolItem({ tool }: { tool: Tool }) {
  const note = tool.blocked ?? tool.detail
  return (
    <Menu.Item className={itemClass} disabled={!!tool.blocked} title={tool.blocked ?? undefined} onSelect={tool.run}>
      <tool.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{tool.label}</span>
        {note && (
          <span
            className={cn(
              "text-[11.5px] leading-snug",
              tool.blocked && !tool.pending ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {note}
          </span>
        )}
      </span>
      {tool.pressed && <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" />}
    </Menu.Item>
  )
}

export function StoryboardTools() {
  const { t } = useLingui()
  const tools = useTools()
  if (!tools) return null
  const { prune, groups } = tools
  return (
    <div role="toolbar" aria-label={t`Storyboard tools`} className={shellClass}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={prune.label}
            aria-pressed={prune.pressed}
            aria-disabled={!!prune.blocked || undefined}
            onClick={() => {
              if (!prune.blocked) prune.run()
            }}
            className={iconButtonClass}
          >
            <prune.icon className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex max-w-[240px] flex-col items-start gap-0.5">
          <span className="font-medium">{prune.label}</span>
          {(prune.blocked ?? prune.detail) && <span className="opacity-75">{prune.blocked ?? prune.detail}</span>}
        </TooltipContent>
      </Tooltip>
      <Menu.Root modal={false}>
        <Menu.Trigger asChild>
          <button type="button" aria-label={t`More storyboard tools`} title={t`More tools`} className={iconButtonClass}>
            <MoreHorizontal className="size-4" />
          </button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            collisionBoundary={typeof document === "undefined" ? undefined : document.getElementById("pipeline-canvas")}
            className="z-50 w-72 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
          >
            {groups.map((group, index) => (
              <Menu.Group key={group.key}>
                {index > 0 && <Menu.Separator className="my-1 h-px bg-border" />}
                <GroupLabel>{group.label}</GroupLabel>
                {group.tools.map((tool) => (
                  <ToolItem key={tool.key} tool={tool} />
                ))}
              </Menu.Group>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  )
}
