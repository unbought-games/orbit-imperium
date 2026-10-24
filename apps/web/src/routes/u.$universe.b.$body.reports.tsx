import { createFileRoute, Outlet } from '@tanstack/react-router'
export const Route = createFileRoute('/u/$universe/b/$body/reports')({
  component: Outlet,
})
