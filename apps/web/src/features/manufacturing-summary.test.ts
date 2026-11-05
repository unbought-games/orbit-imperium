import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { manufacturingQueue } from '../client-model/manufacturing-queue'
import { ManufacturingSummary } from './manufacturing-summary'

type Batch = ReturnType<typeof manufacturingQueue>[number]
const active: Batch = {
  id: 'active',
  item: { kind: 'Ship', id: 'LargeCargo' },
  remaining: '4',
  status: 'Producing',
  due: 240000,
  finalDue: 2700000,
  unitDuration: 820000,
}
const pending: Batch = {
  ...active,
  id: 'pending',
  status: 'Confirming',
  due: undefined,
  finalDue: undefined,
  unitDuration: undefined,
}
const render = (queue: Batch[]) =>
  renderToStaticMarkup(
    createElement(ManufacturingSummary, {
      queue,
      now: 0,
      countdown: (due) => (due === active.due ? '4m' : '45m'),
    }),
  )

it('combines order and queue completion for a lone order, regardless of unit count', () => {
  for (const remaining of ['4', '1']) {
    const markup = render([
      {
        ...active,
        remaining,
        finalDue: remaining === '1' ? active.due : active.finalDue,
      },
    ])
    expect(markup).toContain('Next unit')
    expect(markup).toContain('Until complete')
    expect(markup).not.toContain('This order')
    expect(markup).not.toContain('Entire queue')
    expect(markup.match(/<dt>/g)).toHaveLength(2)
  }
})

it('preserves both completion scopes for separate orders even when rounded times match', () => {
  const markup = render([
    active,
    {
      ...active,
      id: 'next',
      status: 'Queued',
      finalDue: active.finalDue! + 1000,
    },
  ])
  expect(markup).toContain('Next unit')
  expect(markup).toContain('This order')
  expect(markup).toContain('Entire queue')
  expect(markup).not.toContain('Until complete')
  expect(markup.match(/45m/g)).toHaveLength(2)
})

it('counts unconfirmed orders without inventing completion times', () => {
  const single = render([pending])
  expect(single).toContain('Until complete')
  expect(single).not.toContain('This order')
  expect(single.match(/>Pending</g)).toHaveLength(2)
  const multiple = render([active, pending])
  expect(multiple).toContain('This order')
  expect(multiple).toContain('Entire queue')
  expect(multiple).not.toContain('Until complete')
  expect(multiple).toContain('45m')
  expect(multiple.match(/>Pending</g)).toHaveLength(1)
})
