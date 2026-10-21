import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DetectionPercent } from './detection'
it.each([
  [0, '0%'],
  [1, '&lt;1%'],
  [53584, '5%'],
  [999999, '99%'],
  [1000000, '100%'],
  [-1, 'Unknown'],
  [Infinity, 'Unknown'],
])('floors detection probability %s', (value, expected) => {
  expect(
    renderToStaticMarkup(
      createElement(DetectionPercent, { value: Number(value) }),
    ),
  ).toBe(expected)
})
