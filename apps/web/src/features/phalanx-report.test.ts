import { createElement } from 'react'
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PhalanxReport } from './phalanx-report'
import type { components } from '../contracts'
const endpoint = {
  kind: 'Planet' as const,
  body: 'target',
  coordinates: { galaxy: 1, system: 10, position: 2 },
}
const observation: components['schemas']['PhalanxReport4'] = {
  version: 'V1',
  report: {
    id: 'report',
    at: 1793667600000,
    source: { ...endpoint, kind: 'Moon' },
    target: endpoint,
    cost: '5000000000',
    rows: [],
  },
}
it('renders an empty paid observation without claiming the absence of hidden fleets', () => {
  const html = renderToStaticMarkup(
    createElement(PhalanxReport, { observation }),
  )
  expect(html).toContain('No visible movements were observed')
  expect(html).toContain('Hidden movements are not disclosed')
  expect(html).toContain('5,000')
  expect(html).toContain('does not update')
})
it('uses historical owner names and exactly the supplied deadline', () => {
  const html = renderToStaticMarkup(
    createElement(PhalanxReport, {
      observation: {
        ...observation,
        report: {
          ...observation.report,
          rows: [
            {
              kind: 'Missile',
              attacker: { id: 'owner', name: 'Historical name' },
              source: endpoint.coordinates,
              target: endpoint,
              count: '8',
              deadline: { kind: 'Impact', at: 1793667660000 },
            },
          ],
        },
      },
    }),
  )
  expect(html).toContain('Historical name')
  expect(html).toContain('Impact:')
  expect(html).not.toContain('Arrival:')
  expect(html).not.toContain('Return:')
})
