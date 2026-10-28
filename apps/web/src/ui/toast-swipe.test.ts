import { describe, expect, it } from 'vitest'
import { shouldDismissToast } from './toast-swipe'
describe('toast swipe intent', () => {
  it('dismisses deliberate travel in either direction', () => {
    expect(shouldDismissToast(64, 0)).toBe(true)
    expect(shouldDismissToast(-64, 0)).toBe(true)
  })
  it('accepts short quick flicks but rejects taps and reversed flicks', () => {
    expect(shouldDismissToast(20, 600)).toBe(true)
    expect(shouldDismissToast(-20, -600)).toBe(true)
    expect(shouldDismissToast(5, 1200)).toBe(false)
    expect(shouldDismissToast(25, 100)).toBe(false)
    expect(shouldDismissToast(20, -600)).toBe(false)
  })
})
