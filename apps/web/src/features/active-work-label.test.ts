import { expect, it } from 'vitest'
import { activeWorkLabel } from './active-work-label'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActiveWorkCard } from './active-work-card'

it.each([
  ['Building', 'up', 'In progress', 60, 'Upgrading now'],
  ['Building', 'down', 'In progress', 60, 'Tearing down'],
  ['Research', undefined, 'In progress', 60, 'Researching now'],
  ['Building', 'up', 'In progress', null, 'Awaiting confirmation'],
  ['Research', undefined, 'In progress', null, 'Awaiting confirmation'],
  ['Building', 'up', 'Confirming', 60, 'Confirming'],
  ['Research', undefined, 'Cancelling', null, 'Cancelling'],
] as const)(
  'labels %s %s %s at %s seconds',
  (kind, direction, status, seconds, expected) => {
    expect(activeWorkLabel(kind, direction, status, seconds)).toBe(expected)
  },
)
it.each([
  [{ kind: 'Building', id: 'RoboticsFactory' }, 'Robotics Factory'],
  [{ kind: 'Defense', id: 'RocketLauncher' }, 'Rocket Launcher'],
] as const)(
  'renders catalog-specific artwork and identity for %j',
  (item, name) => {
    const html = renderToStaticMarkup(
      createElement(ActiveWorkCard, {
        item,
        status: 'In progress',
        badge: 'Level 5',
        percent: 50,
        progressLabel: 'Estimated progress',
        children: null,
      }),
    )
    expect(html).toContain(name)
    expect(html).toContain('aria-valuenow="50"')
    expect(html).toContain('data-moving="true"')
    expect(html).toContain(
      `/art/atlas/objects/${item.id === 'RoboticsFactory' ? 'robotics-factory' : 'rocket-launcher'}-96.webp`,
    )
  },
)
