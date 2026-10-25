import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { readAddress, validateLocationIntent } from '../shell/location-address'
import { useGameScreen } from '../shell/screen-context'
import { InvalidRoute } from '../shell/invalid-route'
export const Route = createFileRoute('/u/$universe/location/$coordinates')({
  staticData: { page: 'galaxy' },
  validateSearch: validateLocationIntent,
  component: LocationDestination,
})
function LocationDestination() {
  const { coordinates: address, universe } = Route.useParams()
  const { target, mission } = Route.useSearch()
  const { body } = useGameScreen()
  const navigate = useNavigate()
  const bodyId = body?.id
  useEffect(() => {
    const coordinates = readAddress(address)
    if (!coordinates || !bodyId) return
    void navigate({
      to: mission
        ? '/u/$universe/b/$body/dispatch'
        : '/u/$universe/b/$body/galaxy',
      params: { universe, body: bodyId },
      search: { ...coordinates, target, ...(mission ? { mission } : {}) },
      replace: true,
    })
  }, [address, universe, target, mission, bodyId, navigate])
  return readAddress(address) && body ? (
    <p role="status">Opening location…</p>
  ) : (
    <InvalidRoute />
  )
}
