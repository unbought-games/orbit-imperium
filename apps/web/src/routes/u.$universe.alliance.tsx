import { createFileRoute } from '@tanstack/react-router'
import { AllianceScreen } from '../features/alliances/screen'
import { validateBodySearch } from '../shell/routes'
export const Route = createFileRoute('/u/$universe/alliance')({
  staticData: { page: 'alliance' },
  validateSearch: (search: Record<string, unknown>) => {
    const body = validateBodySearch(search)
    if (search.alliance === undefined)
      return body as { body?: string; alliance?: string }
    if (
      typeof search.alliance !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(search.alliance)
    )
      throw new Error('This address contains an invalid alliance.')
    return { ...body, alliance: search.alliance }
  },
  component: AllianceScreen,
})
