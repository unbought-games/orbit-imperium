import { expect, it } from 'vitest'
import { tooltipOpenChange } from './info-tooltip-state'

it('keeps a tapped explanation open through compatibility hover events', () => {
  expect(tooltipOpenChange('pressed', false, 'trigger-hover')).toBe('pressed')
  expect(tooltipOpenChange('pressed', true, 'trigger-hover')).toBe('pressed')
})
it('allows normal hover and keyboard-focus explanations to open and close', () => {
  for (const reason of ['trigger-hover', 'trigger-focus']) {
    expect(tooltipOpenChange(null, true, reason)).toBe('transient')
    expect(tooltipOpenChange('transient', false, reason)).toBeNull()
  }
})
it('dismisses tapped explanations on outside presses, Escape and focus departure', () => {
  for (const reason of ['outside-press', 'escape-key', 'trigger-focus']) {
    expect(tooltipOpenChange('pressed', false, reason)).toBeNull()
  }
})
