import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { StudentInput } from "@adt/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function StudentForm({ initial, submitLabel, onSubmit, pending }: { initial?: StudentInput; submitLabel: string; onSubmit: (data: StudentInput) => void; pending?: boolean }) {
  const { t } = useLingui()
  const [data, setData] = useState<StudentInput>(initial ?? { firstName: "", lastName: "", grade: "", age: null, notes: "", parentName: "", parentEmail: "" })
  const set = (key: keyof StudentInput, value: string | number | null) => setData((current) => ({ ...current, [key]: value }))
  return <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(data) }}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="firstName"><Trans>First name</Trans></Label><Input id="firstName" required value={data.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="lastName"><Trans>Last name</Trans></Label><Input id="lastName" required value={data.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="grade"><Trans>Grade</Trans></Label><Input id="grade" value={data.grade} onChange={(e) => set("grade", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="age"><Trans>Age</Trans></Label><Input id="age" type="number" min="0" max="120" value={data.age ?? ""} onChange={(e) => set("age", e.target.value ? Number(e.target.value) : null)} /></div>
      <div className="space-y-2"><Label htmlFor="parentName"><Trans>Parent or guardian name</Trans></Label><Input id="parentName" value={data.parentName} onChange={(e) => set("parentName", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="parentEmail"><Trans>Parent or guardian email</Trans></Label><Input id="parentEmail" type="email" value={data.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="notes"><Trans>Notes</Trans></Label><Textarea id="notes" value={data.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t`Learning preferences, interests, or useful context`} /></div>
    <Button type="submit" disabled={pending}>{submitLabel}</Button>
  </form>
}
