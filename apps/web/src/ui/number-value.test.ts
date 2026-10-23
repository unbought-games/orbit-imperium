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
  ).toBe('1h 1m')
  expect(
    renderToStaticMarkup(createElement(DurationValue, { milliseconds: 999 })),
  ).toBe('0s')
})
it('keeps positive sub-unit deficits visible instead of claiming zero is needed', () => {
  expect(
    renderToStaticMarkup(createElement(ResourceShortfall, { value: '1' })),
  ).toBe('1')
  expect(
    renderToStaticMarkup(
      createElement(ResourceShortfall, { value: '61999999' }),
    ),
  ).toBe('62')
})
it('rounds shortages up to agree with whole costs and floored available balances', () => {
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
  expect(text).toContain('Available317After spendingNeed 62 more')
  expect(text).toContain('Available864After spending713')
  expect(text).toContain('Available0After spendingNeed 1 more')
  expect(text).not.toMatch(/\d\.\d/)
})

it.each([
  ['182000000', '18'],
  ['182000001', '18'],
  ['182999999', '18'],
  ['199999999', '1'],
  ['199000000', '1'],
])(
  'keeps cost 200 minus displayed balance consistent at %s micro units',
  (available, shortage) => {
    const markup = renderToStaticMarkup(
      createElement(ResourceCosts, {
        cost: { metal: '0', crystal: '0', deuterium: '200000000' },
        available: { metal: '0', crystal: '0', deuterium: available },
      }),
    ).replace(/<[^>]+>/g, '')
    expect(markup).toContain(
      `Available${BigInt(available) / 1000000n}After spendingNeed ${shortage} more`,
    )
  },
)
