import { createFileRoute } from '@tanstack/react-router'

// The parent owns the workspace so section navigation preserves authored drafts.
export const Route = createFileRoute('/u/$universe/alliance/$item')({
  staticData: { page: 'alliance' },
})
