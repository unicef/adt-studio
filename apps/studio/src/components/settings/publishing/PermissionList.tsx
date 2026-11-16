import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { TOKEN_PERMISSIONS, type TokenPermission } from "./token-permissions"

interface PermissionListProps {
  /** Ids of permissions Cloudflare reported as missing, highlighted in place. */
  missingIds?: readonly string[]
  /** Show only the missing rows — used in the "add these" error guidance. */
  onlyMissing?: boolean
}

export function PermissionList({ missingIds = [], onlyMissing = false }: PermissionListProps) {
  const { i18n } = useLingui()
  const rows: readonly TokenPermission[] = onlyMissing
    ? TOKEN_PERMISSIONS.filter((permission) => missingIds.includes(permission.id))
    : TOKEN_PERMISSIONS

  if (rows.length === 0) return null

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((permission) => {
        const isMissing = missingIds.includes(permission.id)
        return (
          <li
            key={permission.id}
            data-testid={`token-permission-${permission.id}`}
            data-missing={isMissing ? "true" : undefined}
            className={cn(
              "flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-2 text-sm transition-[background-color,border-color] duration-200 motion-reduce:transition-none",
              isMissing
                ? "border-destructive/40 bg-destructive/5 text-foreground"
                : "border-border bg-muted/40 text-foreground",
            )}
          >
            <span className="font-medium">{i18n._(permission.group)}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{i18n._(permission.resource)}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{i18n._(permission.access)}</span>
            {isMissing && (
              <span className="ml-auto text-xs font-medium text-destructive">
                <Trans>Missing</Trans>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
