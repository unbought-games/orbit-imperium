import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import {
  DurationValue,
  NumberValue,
  ResourceNumber,
  ResourceShortfall,
  ResourceSummary,
} from './number-value'
import { ResourceCosts } from './resource-costs'

it('renders floored numbers, scaled resources, and durations through shared components', () => {
  expect(
    renderToStaticMarkup(createElement(NumberValue, { value: 99.9 })),
  ).toBe('99')
  expect(
    renderToStaticMarkup(createElement(ResourceNumber, { value: '-3500000' })),
  ).toBe('-4')
  expect(
    renderToStaticMarkup(
      createElement(ResourceSummary, {
        value: { metal: '1999999', crystal: '2000000', deuterium: '999999' },
      }),
    ),
  ).toBe('1 metal · 2 crystal · 0 deuterium')
  expect(
    renderToStaticMarkup(
      createElement(DurationValue, { milliseconds: 3661999 }),
    ),
  ).toBe('1h 1m 1s')
  expect(
    renderToStaticMarkup(createElement(DurationValue, { milliseconds: 999 })),
  ).toBe('0s')
})
it('keeps positive sub-unit deficits visible instead of claiming zero is needed', () => {
  expect(
    renderToStaticMarkup(createElement(ResourceShortfall, { value: '1' })),
  ).toBe('&lt;1')
  expect(
    renderToStaticMarkup(
      createElement(ResourceShortfall, { value: '61999999' }),
    ),
  ).toBe('61')
})
it('floors each ledger amount after exact arithmetic, including a sub-unit shortage', () => {
  const markup = renderToStaticMarkup(
    createElement(ResourceCosts, {
      cost: { metal: '379000000', crystal: '151000000', deuterium: '1000000' },
      available: {
        metal: '317203635',
        crystal: '864661927',
        deuterium: '999999',
      },
    }),
  )
  const text = markup.replace(/<[^>]+>/g, '')
  expect(text).toContain('Available317After spendingNeed 61 more')
  expect(text).toContain('Available864After spending713')
  expect(text).toContain('Available0After spendingNeed &lt;1 more')
  expect(text).not.toMatch(/\d\.\d/)
})
