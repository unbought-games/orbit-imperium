import { createFileRoute, Navigate } from '@tanstack/react-router'

// App completes authenticated enrollment before mounting the game shell.
export const Route = createFileRoute('/join/$universe')({
  component: () => <Navigate to="/login" replace />,
})
