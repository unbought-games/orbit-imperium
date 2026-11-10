import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('restricts sidebar transitions to desktop color feedback without reduced motion', () => {
  const styles = readFileSync(
    new URL('./navigation.module.css', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '')
  // Catch accidentally widening this opt-in to phones/reduced motion, adding
  // geometry transitions, or losing the override of the global motion reset.
  const optIn = styles.match(
    /@media\s*\(min-width:\s*1024px\)\s*and\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([^{}]+)\{([^{}]+)\}\s*\}/,
  )
  expect(optIn).not.toBeNull()
  expect(optIn![1].split(',').map((selector) => selector.trim())).toEqual([
    '.sidebarDestinations a',
    '.sidebarDestinations button',
    '.sidebarPlayer',
    '.accountMenuItem',
  ])
  const transition =
    'transition: background-color 150ms ease, color 150ms ease !important;'
  expect(optIn![2].replace(/\s+/g, ' ').trim()).toBe(transition)
  expect(styles.match(/\btransition(?:-[a-z]+)?\s*:/g)).toEqual(['transition:'])
})
