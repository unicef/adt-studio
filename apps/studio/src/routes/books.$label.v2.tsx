import { createFileRoute, Outlet, useParams, Link } from "@tanstack/react-router"
import { Home } from "lucide-react"
import { StepSidebar } from "@/components/v2/StepSidebar"
import { useBook } from "@/hooks/use-books"

export const Route = createFileRoute("/books/$label/v2")({
  component: V2Layout,
})

function V2Layout() {
  const { label } = Route.useParams()
  const { step } = useParams({ strict: false }) as { step?: string }
  const { data: book } = useBook(label)

  const activeStep = step ?? "extract"

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left sidebar */}
      <div className="w-[220px] shrink-0 bg-muted/20 flex flex-col">
        {/* Book header */}
        <div className="shrink-0 h-10 px-4 flex items-center gap-2.5 bg-gray-700 text-white border-r border-gray-700">
          <Link
            to="/"
            className="flex items-center justify-center w-6 h-6 rounded text-white/60 hover:text-white transition-colors"
          >
            <Home className="w-4 h-4" />
          </Link>
          <h2 className="text-sm font-semibold truncate">
            {book?.title ?? book?.label ?? label}
          </h2>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto border-r border-gray-300">
          <StepSidebar bookLabel={label} activeStep={activeStep} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
