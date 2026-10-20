import { createFileRoute, Outlet } from '@tanstack/react-router'
export const Route = createFileRoute('/u/$universe/reports')({
  component: Outlet,
})
