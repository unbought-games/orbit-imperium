import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/u/$universe/b/$body/facilities/$item')({
  staticData: { page: 'facilities' },
})
