import { Bot, FileText, KeyRound } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { SettingsSection } from "./settingsSections"

export function SettingsNavigation({ activeSection }: { activeSection: SettingsSection }) {
  const { t } = useLingui()
  const items = [
    {
      section: "default-model" as const,
      icon: Bot,
      label: <Trans>Default model</Trans>,
      shortLabel: <Trans>Model</Trans>,
      description: <Trans>Pipeline fallback model</Trans>,
    },
    {
      section: "api-keys" as const,
      icon: KeyRound,
      label: <Trans>API keys</Trans>,
      shortLabel: <Trans>API keys</Trans>,
      description: <Trans>Provider credentials</Trans>,
    },
    {
      section: "prompts" as const,
      icon: FileText,
      label: <Trans>Global prompts</Trans>,
      shortLabel: <Trans>Prompts</Trans>,
      description: <Trans>Shared prompt versions</Trans>,
    },
  ]

  return (
    <aside className="shrink-0 border-b bg-muted/20 md:w-64 md:border-b-0 md:border-r">
      <nav aria-label={t`Settings navigation`} className="grid grid-cols-3 gap-1 p-2 md:flex md:flex-col md:px-3">
        {items.map(({ section, icon: Icon, label, shortLabel }) => {
          const isActive = activeSection === section
          return (
            <Link
              key={section}
              to="/settings"
              search={{ section }}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-10 min-w-0 items-center gap-2 rounded-md border p-2 text-left transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "border-border bg-background text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium sm:text-sm md:hidden">{shortLabel}</span>
                <span className="hidden truncate text-sm font-medium md:block">{label}</span>
              </span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
