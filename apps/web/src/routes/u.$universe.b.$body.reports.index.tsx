import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/u/$universe/b/$body/reports/')({
  staticData: { page: 'reports' },
})
