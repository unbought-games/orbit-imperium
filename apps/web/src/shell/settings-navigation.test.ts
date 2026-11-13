import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createMemoryHistory,
  RouterContextProvider,
} from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { createAppRouter } from '../router'
import { SettingsNavigation } from './settings-navigation'

it('marks only the current real settings path active, without a second default identity selection', async () => {
  for (const [section, label] of [
    ['identity', 'Empire identity'],
    ['game', 'Game settings'],
    ['support', 'Help &amp; community'],
    ['session', 'Account &amp; session'],
    ['deletion', 'Empire deletion'],
  ]) {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: [`/u/andromeda/b/mars/settings/${section}`],
      }),
    })
    await router.load()
    const html = renderToStaticMarkup(
      createElement(RouterContextProvider, {
        router,
        children: createElement(SettingsNavigation, {
          universeName: 'Andromeda',
          body: 'mars',
          protocol: 4,
        }),
      }),
    )
    const active = [
      ...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g),
    ].map((match) => match[0])
    expect(active).toHaveLength(1)
    expect(active[0]).toContain(label)
    expect(active[0]).toContain(`/settings/${section}`)
    expect(html).not.toContain('Your empire')
    expect(html).not.toContain('#')
  }
})

it.each([2, 3] as const)(
  'omits empire deletion from protocol %s navigation',
  async (protocol) => {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: ['/u/andromeda/b/mars/settings/game'],
      }),
    })
    await router.load()
    const html = renderToStaticMarkup(
      createElement(RouterContextProvider, {
        router,
        children: createElement(SettingsNavigation, {
          universeName: 'Andromeda',
          body: 'mars',
          protocol,
        }),
      }),
    )
    expect(html).toContain('Game settings')
    expect(html).not.toContain('Empire deletion')
    expect(html).not.toContain('/settings/deletion')
  },
)
