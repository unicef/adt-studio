import type { ReactNode } from "react"
import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import {
  Plus,
  Search,
  House,
  BookMarked,
  Split,
  Settings,
  CircleHelp,
  BookOpen,
  Library,
  Keyboard,
  Sparkles,
  Bug,
  Info,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Kbd } from "./ui/Kbd"
import { REDESIGN_PATHS, activeRedesignView } from "./nav"
import type { RedesignView } from "./types"
import { useUpdateDialog } from "@/components/updates"
import { SidebarLogo } from "./SidebarLogo"

const DOCS_URL = "https://unicef.github.io/adt-studio/docs/get-started/";
const ISSUES_URL = "https://github.com/unicef/adt-studio/issues";

const DOCS_LABEL: Record<RedesignView, MessageDescriptor> = {
  home: msg`Home guide`,
  library: msg`Library guide`,
  handoffs: msg`Split & merge guide`,
  settings: msg`Settings guide`,
}

export interface AppSidebarProps {
  libraryCount: number
  handoffsCount: number
  onOpenPalette: () => void
  onOpenAdd: () => void
  onOpenShortcuts: () => void
}

function MenuRow({
  icon: Icon,
  children,
  trailing,
  onClick,
}: {
  icon: LucideIcon
  children: ReactNode
  trailing?: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </button>
  )
}

export function AppSidebar({
  libraryCount,
  handoffsCount,
  onOpenPalette,
  onOpenAdd,
  onOpenShortcuts,
}: AppSidebarProps) {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const activeView = activeRedesignView(pathname)
  const [helpOpen, setHelpOpen] = useState(false)
  const { showWhatsNew } = useUpdateDialog()

  const items: { view: RedesignView; label: string; icon: LucideIcon; count?: number }[] = [
    { view: "home", label: t`Home`, icon: House },
    { view: "library", label: t`Library`, icon: BookMarked, count: libraryCount },
    { view: "handoffs", label: t`Split & merge`, icon: Split, count: handoffsCount },
  ]

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-auto border-r bg-sidebar px-3 pb-3">

      <SidebarLogo />

      <Button onClick={onOpenAdd} size="sm" className="mb-3 w-full">
        <Plus className="size-3.5" />
        <Trans>Add book</Trans>
      </Button>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-9 items-center gap-2.5 rounded-[10px] border bg-card px-3 text-muted-foreground transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-[0_0_0_3px_var(--brand-50)]"
      >
        <Search className="size-[15px]" />
        <span className="flex-1 text-left text-[13px]">
          <Trans>Search books…</Trans>
        </span>
        <Kbd keys={["⌘", "K"]} />
      </button>

      <nav className="mt-2 flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon
          const active = activeView === item.view
          return (
            <Link
              key={item.view}
              to={REDESIGN_PATHS[item.view]}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-card font-semibold text-brand-700 ring-1 ring-border shadow-sm"
                  : "text-foreground hover:bg-black/5 dark:hover:bg-white/5",
              )}
            >
              <Icon className="size-[17px]" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.count != null && (
                <span
                  className={cn(
                    "min-w-[21px] rounded-full px-1.5 text-center font-mono text-[11px] font-semibold",
                    active ? "bg-brand-100 text-brand-700" : "bg-black/5 text-muted-foreground dark:bg-white/10",
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="min-h-3.5 flex-1" />

      <div className="flex items-center gap-1.5 pt-1.5">
        <Link
          to={REDESIGN_PATHS.settings}
          className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Settings className="size-[17px]" />
          <span className="flex-1 text-left">
            <Trans>Settings</Trans>
          </span>
        </Link>

        <Popover open={helpOpen} onOpenChange={setHelpOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t`Help`}
              title={t`Help`}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
            >
              <CircleHelp className="size-[17px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" sideOffset={10} className="w-[262px] p-1.5">
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg bg-brand-50 px-2.5 py-2.5 text-left transition-colors hover:bg-brand-100"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-primary-foreground">
                <BookOpen className="size-[15px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-brand-800">{i18n._(DOCS_LABEL[activeView])}</div>
                <div className="text-[11px] text-brand-700">
                  <Trans>Open the relevant doc page</Trans>
                </div>
              </div>
              <ArrowUpRight className="size-3.5 text-brand-600" />
            </button>
            <div className="mx-1.5 my-1.5 h-px bg-border" />
            <MenuRow
              icon={Library}
              trailing={<ArrowUpRight className="size-3.5 text-muted-foreground" />}
              onClick={() => {
                setHelpOpen(false);
                window.open(DOCS_URL, "_blank", "noopener,noreferrer");
              }}
            >
              <Trans>Browse documentation</Trans>
            </MenuRow>
            <MenuRow
              icon={Keyboard}
              trailing={<Kbd keys={["?"]} />}
              onClick={() => {
                setHelpOpen(false)
                onOpenShortcuts()
              }}
            >
              <Trans>Keyboard shortcuts</Trans>
            </MenuRow>
            <MenuRow
              icon={Sparkles}
              onClick={() => {
                setHelpOpen(false);
                showWhatsNew();
              }}
            >
              <Trans>What&apos;s new</Trans>
            </MenuRow>
            <div className="mx-1.5 my-1.5 h-px bg-border" />
            <MenuRow
              icon={Bug}
              trailing={<ArrowUpRight className="size-3.5 text-muted-foreground" />}
              onClick={() => {
                setHelpOpen(false);
                window.open(ISSUES_URL, "_blank", "noopener,noreferrer");
              }}
            >
              <Trans>Report an issue</Trans>
            </MenuRow>
            <MenuRow
              icon={Info}
              onClick={() => {
                setHelpOpen(false)
                navigate({ to: "/redesign/settings/about",  })
              }}
            >
              <Trans>About ADT Studio</Trans>
            </MenuRow>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
