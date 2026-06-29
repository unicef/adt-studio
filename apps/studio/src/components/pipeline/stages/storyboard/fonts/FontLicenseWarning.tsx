import { TriangleAlert } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { BookFontWithStatus } from "@/api/client"
import { licenseStatus } from "./font-utils"

export function FontLicenseWarning({ font }: { font: BookFontWithStatus }) {
  const { t } = useLingui()
  const status = licenseStatus(font)
  if (status !== "restricted" && status !== "unverified") return null
  const restricted = status === "restricted"
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs",
        restricted ? "text-destructive" : "text-amber-600 dark:text-amber-500",
      )}
      role="alert"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        {restricted
          ? t`This font's license is not open-source and restricts embedding — distributing it inside the book bundle may be illegal.`
          : t`No open-source license detected. Make sure you have the right to embed and distribute this font.`}
        {font.license?.url && (
          <>
            {" "}
            <a
              href={font.license.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {t`View license`}
            </a>
          </>
        )}
      </span>
    </p>
  )
}
