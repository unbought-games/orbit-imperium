import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/u/$universe/b/$body/research/$item')({
  staticData: { page: 'research' },
})
