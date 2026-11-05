import { expect, it } from 'vitest'
import { identityTextParts } from './identity-text'
it.each([
  ['', '', '', ''],
  ['A', '', '', 'A'],
  ['Aurelia', 'A', 'ureli', 'a'],
  ['e\u0301', '', '', 'e\u0301'],
  ['e\u0301toile', 'e\u0301', 'toil', 'e'],
  ['Zoë 👩🏽‍🚀', 'Z', 'oë ', '👩🏽‍🚀'],
  ['星の旅人', '星', 'の旅', '人'],
])('preserves complete edge graphemes in %s', (name, first, middle, last) => {
  expect(identityTextParts(name)).toEqual({ first, middle, last })
  expect(first + middle + last).toBe(name)
})
