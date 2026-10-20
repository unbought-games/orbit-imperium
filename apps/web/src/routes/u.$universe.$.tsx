import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/u/$universe/$')({
  staticData: { page: null },
  component: UnknownDestination,
})
function UnknownDestination() {
  return null
}
