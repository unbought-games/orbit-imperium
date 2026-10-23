import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/u/$universe/b/$body/defense/$item')({
  staticData: { page: 'defense' },
})
