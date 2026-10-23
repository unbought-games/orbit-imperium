import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/u/$universe/b/$body/shipyard/$item')({
  staticData: { page: 'shipyard' },
})
