import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { Plus, Users } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StudioTopBar } from "@/components/StudioTopBar"
import { useStudents } from "@/hooks/use-students"

export const Route = createFileRoute("/students/")({ component: StudentsPage })
function StudentsPage() {
  const { t } = useLingui(); const [search, setSearch] = useState(""); const { data: students, isLoading } = useStudents(search)
  return <div className="flex min-h-0 flex-1 flex-col"><StudioTopBar brandLinksHome trailingTitle={<Trans>Students</Trans>} /><div className="mx-auto w-full max-w-5xl space-y-6 overflow-auto p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold"><Trans>Students</Trans></h1><p className="text-sm text-muted-foreground"><Trans>Manage learning profiles and personalized materials.</Trans></p></div><Button asChild><Link to="/students/new"><Plus className="mr-2 h-4 w-4" /><Trans>Add student</Trans></Link></Button></div>
    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t`Search students`} aria-label={t`Search students`} />
    <div className="grid gap-3 sm:grid-cols-2">{students?.map((student) => <Link key={student.id} to="/students/$studentId" params={{ studentId: student.id }} className="rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"><div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><div><h2 className="font-medium">{student.firstName} {student.lastName}</h2><p className="text-sm text-muted-foreground">{student.grade || t`No grade set`} · {student.accessibilityProfiles.length} <Trans>profiles</Trans></p></div></div></Link>)}</div>
    {!isLoading && students?.length === 0 && <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground"><Trans>No students found.</Trans></p>}
  </div></div>
}
