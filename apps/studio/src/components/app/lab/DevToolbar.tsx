import { useEffect, useRef, useState, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { FlaskConical, X } from "lucide-react"
import { createPersistentStore } from "@/hooks/create-persistent-store"

export interface LabOption {
  value: string
  label: ReactNode
}

export interface LabControl {
  key: string
  label: ReactNode
  options: LabOption[]
  cycle?: boolean
}

export interface LabAction {
  key: string
  label: string
  icon?: ReactNode
  onClick: () => void
}

export interface LabGroup {
  key: string
  label: ReactNode
  icon?: ReactNode
  controls: LabControl[]
  note?: ReactNode
}

export type LabValues = Record<string, string>

const hiddenStore = createPersistentStore<boolean>("adt.lab.toolbar-hidden", false, (value): value is boolean => typeof value === "boolean")
const groupStore = createPersistentStore<string>("adt.lab.toolbar-group", "", (value): value is string => typeof value === "string")

function Segment({ control, value, onChange }: { control: LabControl; value: string; onChange: (value: string) => void }) {
  return (
    <div role="radiogroup" aria-label={typeof control.label === "string" ? control.label : control.key} className="flex flex-wrap items-center gap-0.5 rounded-xl bg-white/5 p-1">
      <span className="w-full px-1.5 pt-0.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">{control.label}</span>
      {control.options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={
              "h-7 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none " +
              (active ? "bg-white text-zinc-900 shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white")
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function DevToolbar({
  controls,
  groups = [],
  values,
  onChange,
  actions = [],
  note,
}: {
  controls: LabControl[]
  groups?: LabGroup[]
  values: LabValues
  onChange: (key: string, value: string) => void
  actions?: LabAction[]
  note?: ReactNode
}) {
  const { t } = useLingui()
  const [hidden, setHidden] = hiddenStore.use()
  const [groupKey, setGroupKey] = groupStore.use()
  const [shown, setShown] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const group = groups.find((candidate) => candidate.key === groupKey) ?? groups[0]
  const groupControls = group?.controls ?? []
  const cycled = groupControls.find((control) => control.cycle) ?? controls.find((control) => control.cycle) ?? groupControls[0] ?? controls[0]

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as Node | null
      const free = target === document.body || target === document.documentElement || (target !== null && root.current?.contains(target))
      if (!free) return
      if (event.key === "`") {
        event.preventDefault()
        setHidden((current) => !current)
        return
      }
      if (!cycled || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return
      event.preventDefault()
      const options = cycled.options
      const index = Math.max(0, options.findIndex((option) => option.value === values[cycled.key]))
      const next = options[(index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length]
      onChange(cycled.key, next.value)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cycled, values, onChange, setHidden])

  if (new URLSearchParams(window.location.search).get("toolbar") === "0") return null

  return (
    <div data-lab-toolbar="" className="pointer-events-none fixed right-4 bottom-4 z-[2147483000] flex justify-end">
      {hidden ? (
        <button
          type="button"
          onClick={() => setHidden(false)}
          aria-label={t`Show lab toolbar`}
          className="pointer-events-auto flex h-8 items-center gap-1.5 rounded-full bg-zinc-900/90 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70 shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md transition-[color,transform] duration-150 ease-out hover:text-white active:scale-[0.97]"
        >
          <FlaskConical className="size-3.5" />
          {t`Lab`}
        </button>
      ) : (
        <div
          ref={root}
          className={
            "pointer-events-auto flex w-[min(400px,calc(100vw-32px))] flex-col items-stretch gap-1 rounded-2xl bg-zinc-900/90 p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none " +
            (shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")
          }
        >
          {group && (
            <>
              <div role="tablist" aria-label={t`Lab groups`} className="flex items-center gap-0.5 rounded-xl bg-white/5 p-1">
                {groups.map((candidate) => {
                  const active = candidate.key === group.key
                  return (
                    <button
                      key={candidate.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setGroupKey(candidate.key)}
                      className={
                        "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[12.5px] font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none " +
                        (active ? "bg-white text-zinc-900 shadow-sm" : "text-white/65 hover:bg-white/10 hover:text-white")
                      }
                    >
                      {candidate.icon}
                      {candidate.label}
                    </button>
                  )
                })}
              </div>
              <div key={group.key} role="tabpanel" className="flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
                {group.controls.map((control) => (
                  <Segment key={control.key} control={control} value={values[control.key]} onChange={(value) => onChange(control.key, value)} />
                ))}
                {group.note !== undefined && <p className="px-2 pt-0.5 pb-1 text-[11.5px] leading-snug text-white/55">{group.note}</p>}
              </div>
              {controls.length > 0 && <div className="mx-2 my-0.5 h-px bg-white/10" />}
            </>
          )}
          {controls.map((control) => (
            <Segment key={control.key} control={control} value={values[control.key]} onChange={(value) => onChange(control.key, value)} />
          ))}
          {note !== undefined && <span className="shrink-0 px-2 text-[12px] font-medium text-white/70">{note}</span>}
          <div className="flex items-center justify-end gap-0.5">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              aria-label={action.icon ? action.label : undefined}
              title={action.icon ? action.label : undefined}
              className={
                "h-8 shrink-0 whitespace-nowrap rounded-full text-[12px] font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] " +
                (action.icon ? "grid w-8 place-items-center text-white/70 hover:bg-white/10 hover:text-white" : "bg-white/10 px-3 hover:bg-white/20")
              }
            >
              {action.icon ?? action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label={t`Hide lab toolbar`}
            title={t`Hide (\`)`}
            className="grid size-8 shrink-0 place-items-center rounded-full text-white/60 transition-[background-color,color] duration-150 ease-out hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
          </div>
        </div>
      )}
    </div>
  )
}
