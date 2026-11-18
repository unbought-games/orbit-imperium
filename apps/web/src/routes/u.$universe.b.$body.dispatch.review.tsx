import { createFileRoute } from '@tanstack/react-router'

// The parent keeps the editor mounted through review, edit and submit.
export const Route = createFileRoute('/u/$universe/b/$body/dispatch/review')({
  staticData: { page: 'dispatch' },
})
