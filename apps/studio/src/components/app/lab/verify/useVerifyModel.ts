import { useState } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { useLingui } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { checkedStore } from "../ChecklistPanel"
import { applyStageState, type StageState, type StageStates } from "../stageStates"
import { VARIANT_GROUPS, useVariants, type VariantKey } from "../variants"
import { filterStore, recordStore, type Verdict } from "./stores"
import { selectedVariantText } from "./VariantChips"
import { TESTING_NOW, VERIFY_LOG } from "./verifyLog"

function copy(text: string) {
  const area = document.createElement("textarea")
  area.value = text
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  document.execCommand("copy")
  area.remove()
}

const KNOWN_KEYS = new Set<string>(VARIANT_GROUPS.map((group) => group.key))

export function stateVariantKeys(page: string, state: StageState | null): VariantKey[] {
  if (!state) return []
  const fromLog = VERIFY_LOG[`${page}:${state.id}`]?.variants ?? []
  const keys = [...(state.groups ?? []), ...fromLog].filter((key) => KNOWN_KEYS.has(key))
  return [...new Set(keys)] as VariantKey[]
}

export function useVerifyModel(page: string | null, stageStates: StageStates | null, active: { page: string; id: string } | null) {
  const { t, i18n } = useLingui()
  const [record, setRecord] = recordStore.use()
  const [, setChecked] = checkedStore.use()
  const [storedFilter, setFilter] = filterStore.use()
  const [copied, setCopied] = useState(false)
  const variants = useVariants()

  const states = page && stageStates ? (stageStates.byPage[page] ?? []) : []
  const stage = page ? getStageLabelI18n(page) : ""
  const testingNow = page ? (TESTING_NOW[page] ?? []) : []
  const keyOf = (id: string) => `${page}:${id}`

  const needsRecheck = (id: string) => {
    const entry = VERIFY_LOG[keyOf(id)]
    if (entry?.status !== "fixed" && entry?.status !== "review") return false
    const seen = record.rechecked?.[keyOf(id)]
    const seenRound = seen === true ? 1 : typeof seen === "number" ? seen : 0
    return seenRound < (entry.round ?? 1)
  }
  const recheckCount = states.filter((state) => needsRecheck(state.id)).length
  const filter = recheckCount > 0 ? storedFilter : "all"
  const fixedCount = states.filter((state) => ["fixed", "review"].includes(VERIFY_LOG[keyOf(state.id)]?.status ?? "")).length
  const pendingCount = states.filter((state) => VERIFY_LOG[keyOf(state.id)]?.status === "pending").length
  const visible = states
    .map((state, position) => ({ state, position }))
    .filter(({ state }) => filter !== "recheck" || needsRecheck(state.id))
  const index = page && active?.page === page ? states.findIndex((state) => state.id === active.id) : -1
  const current = index >= 0 ? states[index] : null
  const key = current ? keyOf(current.id) : ""
  const verdict = current ? record.verdicts[key] : undefined
  const note = current ? (record.notes[key] ?? "") : ""
  const reviewed = states.filter((state) => record.verdicts[keyOf(state.id)]).length
  const issues = states.filter((state) => record.verdicts[keyOf(state.id)] === "issue").length
  const log = current ? VERIFY_LOG[key] : undefined
  const variantKeys = page ? stateVariantKeys(page, current) : []

  const open = (position: number) => {
    const target = states[position]
    if (page && target) applyStageState(page, target)
  }
  const order = visible.map(({ position }) => position)
  const others = order.filter((position) => position !== index)
  const hasPrev = filter === "recheck" ? others.length > 0 : order.some((position) => position < index)
  const hasNext = filter === "recheck" ? others.length > 0 : order.some((position) => position > index)
  const step = (direction: 1 | -1) => {
    const ahead = direction === 1 ? order.find((position) => position > index) : [...order].reverse().find((position) => position < index)
    const wrapped = filter === "recheck" ? (direction === 1 ? order[0] : order[order.length - 1]) : undefined
    const next = ahead ?? wrapped
    if (next !== undefined && next !== index) open(next)
  }
  const judge = (next: Verdict | null) => {
    if (!current) return
    setRecord((prev) => {
      const verdicts = { ...prev.verdicts }
      if (next) verdicts[key] = next
      else delete verdicts[key]
      const entry = VERIFY_LOG[key]
      const rechecked = (entry?.status === "fixed" || entry?.status === "review") && next ? { ...prev.rechecked, [key]: entry.round ?? 1 } : prev.rechecked
      return { ...prev, verdicts, rechecked }
    })
    setChecked((prev) => ({ ...prev, [key]: next === "ok" }))
  }
  const toggle = (next: Verdict) => {
    if (!current) return
    judge(verdict === next && !needsRecheck(current.id) ? null : next)
  }
  const setNote = (value: string) => {
    if (!current) return
    setRecord((prev) => ({ ...prev, notes: { ...prev.notes, [key]: value } }))
  }
  const clearStage = () =>
    setRecord((prev) => {
      const verdicts = { ...prev.verdicts }
      const notes = { ...prev.notes }
      const rechecked = { ...prev.rechecked }
      for (const state of states) {
        delete verdicts[keyOf(state.id)]
        delete notes[keyOf(state.id)]
        delete rechecked[keyOf(state.id)]
      }
      return { verdicts, notes, rechecked }
    })
  const exportNotes = () => {
    if (!page) return
    const translate = (descriptor: MessageDescriptor) => i18n._(descriptor)
    const lines = [`# ${t`Verification: ${stage}`} · ${new Date().toISOString().slice(0, 10)}`, ""]
    for (const state of states) {
      const stateKey = keyOf(state.id)
      const mark = record.verdicts[stateKey] === "ok" ? "✅" : record.verdicts[stateKey] === "issue" ? "⚠️" : "·"
      const text = record.notes[stateKey]?.trim()
      const entry = VERIFY_LOG[stateKey]
      const picked = selectedVariantText(stateVariantKeys(page, state), variants, translate)
      const pickedText = picked.length ? ` · ${t`selected`} ${picked.join(", ")}` : ""
      const status = entry ? ` · _${entry.status === "fixed" ? t`fixed, re-check` : entry.status === "review" ? t`variants to pick` : entry.status === "pending" ? t`pending` : t`pinned`}_` : ""
      lines.push(`- ${mark} **${state.label}** (\`${state.id}\`)${status}${pickedText}${text ? ` — ${text}` : ""}`)
    }
    const testing = selectedVariantText(testingNow.flatMap((item) => item.variants), variants, translate)
    if (testing.length) lines.push("", `**${t`Testing now`}** · ${testing.join(", ")}`)
    copy(lines.join("\n"))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return {
    page,
    stage,
    states,
    testingNow,
    record,
    filter,
    setFilter,
    recheckCount,
    fixedCount,
    pendingCount,
    needsRecheck,
    index,
    current,
    verdict,
    note,
    reviewed,
    issues,
    log,
    variantKeys,
    open,
    step,
    hasPrev,
    hasNext,
    toggle,
    setNote,
    clearStage,
    exportNotes,
    copied,
  }
}

export type VerifyModel = ReturnType<typeof useVerifyModel>
