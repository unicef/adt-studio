import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/students")({ component: Outlet })
