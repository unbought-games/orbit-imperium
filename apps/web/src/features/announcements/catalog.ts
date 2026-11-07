import { lazy } from 'react'
import type { Announcement } from './model'

/**
 * Curated in-game announcements. Add an entry here (and its content component in
 * `entries/`) only for releases worth interrupting players for. Content loads on
 * demand, so entries don't grow the main bundle.
 */
export const announcements: readonly Announcement[] = [
  {
    id: 'research-network',
    title: 'The Intergalactic Research Network is here',
    date: '2026-11-06T14:45:55Z',
    href: '/updates/research-network.html',
    Content: lazy(() => import('./entries/research-network')),
  },
]
