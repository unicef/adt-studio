import { useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { motion, useReducedMotion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { ToolApprovalCode } from "@/components/agents/tool-approval"
import type { AgentCodeLanguage } from "@/components/agents/agent-code"
import { SPRING_SWAP } from "@/lib/ease"

const COLLAPSED_LINES = 6
const COLLAPSED_CHARS = 320

export interface ChatApprovalCodeProps {
  code: string
  language?: AgentCodeLanguage
}

function clamp(code: string): { preview: string; truncated: boolean } {
  const lines = code.split("\n").slice(0, COLLAPSED_LINES).join("\n")
  const preview = lines.length > COLLAPSED_CHARS ? lines.slice(0, COLLAPSED_CHARS) : lines
  return { preview, truncated: preview.length < code.length }
}

export function ChatApprovalCode({ code, language = "text" }: ChatApprovalCodeProps) {
  const { t } = useLingui()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)
  const { preview, truncated } = useMemo(() => clamp(code), [code])

  if (!truncated) return <ToolApprovalCode code={code} language={language} />

  return (
    <span className="flex flex-col items-start gap-1">
      <ToolApprovalCode code={open ? code : `${preview.trimEnd()}…`} language={language} />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>{open ? t`Show less` : t`Show more`}</span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
        >
          <ChevronDown className="size-3" />
        </motion.span>
      </button>
    </span>
  )
}
