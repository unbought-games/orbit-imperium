import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { id } from '../test-support/bootstrap'
import { ReportObservation } from './report-observation'

it('displays only the supplied name for an espionage contact and falls back to its public identifier', () => {
  const sender = id(9)
  const payload = {
    kind: 'SpyContact',
    at: 1000,
    sender,
    origin: { galaxy: 1, system: 371, position: 12 },
    target: { galaxy: 1, system: 371, position: 2 },
    probability_ppm: 0,
  }
  function render(names?: Record<string, string>) {
    return renderToStaticMarkup(
      createElement(ReportObservation, { payload, playerNames: names }),
    ).replace(/<[^>]+>/g, '')
  }
  expect(render({ [sender]: 'Commander Vega' })).toContain(
    'Commander Vega sent probes',
  )
  expect(render()).toContain('Player 00000000 sent probes')
})
