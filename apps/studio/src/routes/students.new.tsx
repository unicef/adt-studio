import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { StudioTopBar } from "@/components/StudioTopBar"
import { StudentForm } from "@/components/students/StudentForm"
import { useSaveStudent } from "@/hooks/use-students"

export const Route = createFileRoute("/students/new")({ component: NewStudentPage })
function NewStudentPage() { const { t } = useLingui(); const navigate = useNavigate(); const save = useSaveStudent(); return <div className="flex min-h-0 flex-1 flex-col"><StudioTopBar brandLinksHome trailingTitle={<Trans>New student</Trans>} /><main className="mx-auto w-full max-w-2xl overflow-auto p-6"><h1 className="mb-6 text-2xl font-semibold"><Trans>Add student</Trans></h1><StudentForm submitLabel={t`Create student`} pending={save.isPending} onSubmit={(data) => save.mutate(data, { onSuccess: (student) => navigate({ to: "/students/$studentId", params: { studentId: student.id } }) })} /></main></div> }
