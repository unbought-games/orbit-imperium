import { describe, expect, it } from 'vitest'
import {
  shouldDismissToast,
  createToastSwipeController,
  type ToastSwipeAnimation,
} from './toast-swipe'
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

function gesture() {
  const animations: Array<ToastSwipeAnimation & { stopped: boolean }> = []
  let dismissals = 0
  const controller = createToastSwipeController({
    animate(animation) {
      const entry = { ...animation, stopped: false }
      animations.push(entry)
      return () => {
        entry.stopped = true
      }
    },
    onDismiss() {
      dismissals++
    },
  })
  return { controller, animations, dismissals: () => dismissals }
}
it('a tap opens; a short drag returns without opening and the next tap opens', () => {
  const { controller, animations, dismissals } = gesture()
  controller.pointerDown()
  expect(controller.canOpen()).toBe(true)
  controller.dragStart()
  controller.release(17, 900)
  expect(animations[0]).toMatchObject({ target: 0, kind: 'return' })
  animations[0].complete()
  expect(controller.canOpen()).toBe(false)
  expect(dismissals()).toBe(0)
  controller.pointerDown()
  expect(controller.canOpen()).toBe(true)
})
it('canceled gestures return even beyond the dismissal threshold', () => {
  const { controller, animations, dismissals } = gesture()
  controller.pointerDown()
  controller.dragStart()
  controller.pointerCancel()
  controller.release(100, 900)
  animations[0].complete()
  expect(animations[0]).toMatchObject({ target: 0, kind: 'return' })
  expect(dismissals()).toBe(0)
})
it('a swipe commits in its direction exactly once after completion and blocks later activation', () => {
  const { controller, animations, dismissals } = gesture()
  controller.pointerDown()
  controller.dragStart()
  controller.release(-70, 0)
  expect(animations[0]).toMatchObject({ target: -360, kind: 'dismiss' })
  expect(controller.canOpen()).toBe(false)
  expect(dismissals()).toBe(0)
  controller.pointerDown()
  controller.release(70, 0)
  controller.dismiss()
  expect(animations).toHaveLength(1)
  expect(animations[0].stopped).toBe(false)
  animations[0].complete()
  animations[0].complete()
  expect(dismissals()).toBe(1)
})
it('Escape replaces spring-back and canceled animation completions cannot dismiss after cleanup', () => {
  const { controller, animations, dismissals } = gesture()
  controller.dragStart()
  controller.release(20, 0)
  controller.dismiss()
  expect(animations[0].stopped).toBe(true)
  expect(animations[1]).toMatchObject({ target: 360, kind: 'dismiss' })
  animations[0].complete()
  expect(dismissals()).toBe(0)
  controller.cancelAnimation()
  expect(animations[1].stopped).toBe(true)
  animations[1].complete()
  expect(dismissals()).toBe(0)
})
it('immediate reduced-motion completion still dismisses only once', () => {
  let dismissals = 0
  const controller = createToastSwipeController({
    animate({ complete }) {
      complete()
      complete()
      return () => {}
    },
    onDismiss() {
      dismissals++
    },
  })
  controller.dismiss()
  controller.dismiss()
  expect(dismissals).toBe(1)
})
