import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { AlertCircle, Bot, Check, ChevronDown, Copy, FileText } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"

import type { AdtBundleImportPreview } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

type CopyState = "idle" | "copied" | "error"

function CopyButton({
  value,
  children,
  primary = false,
}: {
  value: string
  children: ReactNode
  primary?: boolean
}) {
  const [state, setState] = useState<CopyState>("idle")
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState("copied")
    } catch {
      setState("error")
    }
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setState("idle"), 1800)
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? "default" : "outline"}
      onClick={copy}
      className={cn(
        "h-8 text-xs",
        primary
          ? "border-0 bg-red-700 text-white hover:bg-red-800"
          : "border-red-200 bg-white text-red-800 hover:bg-red-50",
      )}
    >
      {state === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="grid place-items-center">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">{children}</span>
        <span aria-hidden="true" className="invisible col-start-1 row-start-1"><Trans>Copy failed</Trans></span>
        <span className="col-start-1 row-start-1">
          {state === "copied" ? <Trans>Copied</Trans> : state === "error" ? <Trans>Copy failed</Trans> : children}
        </span>
      </span>
    </Button>
  )
}

export function AdtImportRepairPanel({
  compatibility,
  agentGuide,
}: Pick<AdtBundleImportPreview, "compatibility" | "agentGuide">) {
  const { t } = useLingui()
  const [showGuide, setShowGuide] = useState(false)

  const issueLabel = (
    code: AdtBundleImportPreview["compatibility"]["issues"][number]["code"],
  ) => {
    if (code === "missing-editing-contract") {
      return t`manifest.json is missing current ADT Studio round-trip metadata.`
    }
    if (code === "unsupported-editing-contract") {
      return t`This bundle uses an editing contract that this version of ADT Studio cannot import.`
    }
    if (code === "nested-page") return t`Page HTML files must stay at the bundle root.`
    if (code === "unexpected-bundle-entry") {
      return t`The bundle contains a folder outside the canonical ADT structure.`
    }
    if (code === "changed-page-structure") {
      return t`Page HTML and the bundle indexes disagree. Update pages.json, pageOrder, and pageDataIds together.`
    }
    if (code === "missing-content-root" || code === "multiple-content-roots") {
      return t`The canonical #content page root is missing or duplicated.`
    }
    if (code === "missing-section" || code === "multiple-sections") {
      return t`The page section does not match content/pages.json.`
    }
    if (code === "missing-section-type") return t`The page section is missing data-section-type.`
    if (code === "missing-data-id" || code === "duplicate-data-id" || code === "image-missing-data-id") {
      return t`Editable content has missing or duplicate data-id values.`
    }
    if (code === "remote-asset" || code === "unsafe-asset") {
      return t`The page references a remote or unsafe asset.`
    }
    if (code === "unsupported-stylesheet") {
      return t`Custom stylesheets are not supported. Use the bundled Tailwind classes or inline styles.`
    }
    if (code === "unsupported-script") {
      return t`Custom script files are not supported in a re-importable ADT.`
    }
    if (code === "unsupported-asset-location") {
      return t`Page media must be stored in the canonical images folder.`
    }
    return t`A referenced local asset is missing from the bundle.`
  }

  const guideStatus = agentGuide.status === "current"
    ? t`Current assistant guides found`
    : agentGuide.status === "partial"
      ? t`One assistant guide needs an update`
      : agentGuide.status === "outdated"
        ? t`Assistant guides are outdated`
        : t`Assistant guides are missing`

  return (
    <section className="mx-5 mb-4 overflow-hidden rounded-lg border border-red-200 bg-white motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
      <div className="bg-red-50 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-950"><Trans>This book needs repair before import</Trans></p>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-red-900">
              <Trans>Its published HTML and metadata do not follow the current ADT Studio round-trip structure.</Trans>
            </p>
            <ul className="mt-2.5 max-h-32 space-y-1.5 overflow-y-auto pr-2 text-xs leading-relaxed text-red-900">
              {compatibility.issues.map((issue, index) => (
                <li key={`${issue.code}:${issue.pageHref}:${issue.detail ?? index}`}>
                  <span className="font-mono font-semibold">{issue.pageHref}</span>
                  <span className="text-red-700">: </span>
                  {issueLabel(issue.code)}
                  {issue.detail ? <span className="font-mono text-red-700"> ({issue.detail})</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-red-100 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-700">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-900"><Trans>Repair with an AI assistant</Trans></p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  {guideStatus} · <Trans>Guide version {agentGuide.currentVersion}</Trans>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={agentGuide.repairPrompt} primary>
                  <Trans>Copy repair request</Trans>
                </CopyButton>
                {agentGuide.status !== "current" ? (
                  <CopyButton value={agentGuide.currentGuide}>
                    <Trans>Copy current guide</Trans>
                  </CopyButton>
                ) : null}
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-600">
              {agentGuide.status === "current" ? (
                <Trans>The archive already has the latest instructions. The repair request adds the exact validation errors for the AI to fix.</Trans>
              ) : (
                <Trans>The repair request includes the latest guide and these validation errors. Save the guide as both AGENTS.md and CLAUDE.md at the archive root.</Trans>
              )}
            </p>

            {agentGuide.status !== "current" ? (
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={() => setShowGuide((visible) => !visible)}
                  aria-expanded={showGuide}
                  className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {showGuide ? <Trans>Hide current guide</Trans> : <Trans>View current guide</Trans>}
                  <ChevronDown className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
                    showGuide && "rotate-180",
                  )} />
                </button>
                <Collapsible shown={showGuide}>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
                    <code>{agentGuide.currentGuide}</code>
                  </pre>
                </Collapsible>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
