import { useEffect, useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Cloud, HardDrive, KeyRound, Loader2 } from "lucide-react"
import { DEFAULT_LLM_MODEL_ID } from "@adt/types"
import { Trans, useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import {
  LLM_MODEL_GROUPS,
  ModelSelect,
  type ModelGroup,
} from "@/components/pipeline/components/ModelSelect"
import { useApiKey } from "@/hooks/use-api-key"
import { hasCredentialForModel } from "@/hooks/use-llm-access"
import { cn } from "@/lib/utils"

const CLOUD_MODEL_GROUPS = LLM_MODEL_GROUPS.filter(
  (group) => group.provider !== "ollama",
)

function firstInstalledLocalModel(
  models: Array<{ id: string; installed: boolean; recommended: boolean }>,
): string {
  return models.find((model) => model.installed && model.recommended)?.id
    ?? models.find((model) => model.installed)?.id
    ?? ""
}

function MethodCard({
  checked,
  icon,
  title,
  description,
  onSelect,
  disabled = false,
  children,
}: {
  checked: boolean
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-4 transition-[border-color,box-shadow,opacity] duration-150",
        checked ? "border-blue-500 ring-1 ring-blue-500/30" : "border-[#e5e5e5]",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
      >
        <span className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-md",
          checked ? "bg-blue-50 text-blue-600" : "bg-[#f5f5f5] text-[#525252]",
        )}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-black">{title}</span>
            <span className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border",
              checked ? "border-blue-500 bg-blue-500 text-white" : "border-[#d4d4d4]",
            )}>
              {checked && <Check className="size-3" aria-hidden="true" />}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-5 text-[#737373]">{description}</span>
        </span>
      </button>
      {checked && children && <div className="mt-4 border-t pt-4">{children}</div>}
    </div>
  )
}

export function GenerationMethod({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useLingui()
  const credentials = useApiKey()
  const initialized = useRef(false)
  const localStatus = useQuery({
    queryKey: ["local-ai", "status"],
    queryFn: api.getLocalAIStatus,
    refetchOnWindowFocus: false,
  })
  const defaultModel = useQuery({
    queryKey: ["default-model"],
    queryFn: api.getDefaultModel,
  })
  const installedLocalModel = firstInstalledLocalModel(localStatus.data?.models ?? [])
  const localGroups = useMemo<ModelGroup[]>(() => [{
    provider: "local",
    models: (localStatus.data?.models ?? [])
      .filter((model) => model.installed)
      .map((model) => model.id.replace(/^local:/, "")),
  }], [localStatus.data?.models])

  useEffect(() => {
    if (initialized.current || value || defaultModel.isLoading || localStatus.isLoading) return
    initialized.current = true
    const configured = defaultModel.data?.model ?? ""
    if (configured.startsWith("local:")) {
      const installed = localStatus.data?.models.some(
        (model) => model.id === configured && model.installed,
      )
      onChange(installed ? configured : installedLocalModel || DEFAULT_LLM_MODEL_ID)
      return
    }
    onChange(configured || installedLocalModel || DEFAULT_LLM_MODEL_ID)
  }, [defaultModel.data?.model, defaultModel.isLoading, installedLocalModel, localStatus.data?.models, localStatus.isLoading, onChange, value])

  const localSelected = value.startsWith("local:")
  const loading = localStatus.isLoading || defaultModel.isLoading
  const hasCloudCredential = value && !localSelected
    ? hasCredentialForModel(value, credentials)
    : true

  return (
    <fieldset id="wizard-generation-method" className="space-y-3" aria-busy={loading}>
      <div>
        <legend className="text-sm font-semibold text-black">
          <Trans>Generation method</Trans>
        </legend>
        <p className="mt-1 text-xs leading-5 text-[#737373]">
          <Trans>This choice is saved only for this book and can be changed later.</Trans>
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-24 items-center justify-center rounded-lg border border-[#e5e5e5]">
          <Loader2 className="size-5 animate-spin text-[#737373] motion-reduce:animate-none" aria-label={t`Loading generation options`} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t`Generation method`}>
          <MethodCard
            checked={localSelected}
            disabled={!installedLocalModel}
            onSelect={() => onChange(installedLocalModel)}
            icon={<HardDrive className="size-5" aria-hidden="true" />}
            title={<Trans>Local Gemma</Trans>}
            description={<Trans>Private and free after download. Best for first drafts.</Trans>}
          >
            {installedLocalModel ? (
              <div className="space-y-2">
                <label htmlFor="wizard-local-model" className="block text-xs font-medium text-black">
                  <Trans>Gemma model</Trans>
                </label>
                <ModelSelect
                  inputId="wizard-local-model"
                  value={value}
                  onChange={onChange}
                  placeholder={installedLocalModel}
                  groups={localGroups}
                  inputClassName="h-9 font-mono text-xs"
                />
              </div>
            ) : (
              <p className="text-xs text-amber-700">
                <Trans>Download a Gemma model in Settings → Local AI first.</Trans>
              </p>
            )}
          </MethodCard>

          <MethodCard
            checked={!localSelected && Boolean(value)}
            onSelect={() => onChange(
              defaultModel.data?.model && !defaultModel.data.model.startsWith("local:")
                ? defaultModel.data.model
                : DEFAULT_LLM_MODEL_ID,
            )}
            icon={<Cloud className="size-5" aria-hidden="true" />}
            title={<Trans>Cloud API</Trans>}
            description={<Trans>Faster and higher quality, with provider usage charges.</Trans>}
          >
            <div className="space-y-2">
              <label htmlFor="wizard-cloud-model" className="block text-xs font-medium text-black">
                <Trans>Cloud model</Trans>
              </label>
              <ModelSelect
                inputId="wizard-cloud-model"
                value={localSelected ? "" : value}
                onChange={onChange}
                placeholder={DEFAULT_LLM_MODEL_ID}
                groups={CLOUD_MODEL_GROUPS}
                inputClassName="h-9 font-mono text-xs"
              />
              {!hasCloudCredential && (
                <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700">
                  <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <Trans>Add this provider's key in Settings → API keys before generation.</Trans>
                </p>
              )}
            </div>
          </MethodCard>
        </div>
      )}
    </fieldset>
  )
}
