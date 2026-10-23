import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/u/$universe/b/$body/resources/$item')({
  staticData: { page: 'resources' },
})
