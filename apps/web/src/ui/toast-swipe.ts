/** Travel prevents a jittery tap from becoming a fling. Velocity is px/second. */
export function shouldDismissToast(offset: number, velocity: number) {
  return (
    Math.abs(offset) >= 64 ||
    (Math.abs(offset) >= 18 &&
      Math.abs(velocity) >= 500 &&
      Math.sign(offset) === Math.sign(velocity))
  )
}

export type ToastSwipeAnimation = {
  target: number
  kind: 'dismiss' | 'return'
  complete: () => void
}
/** Gesture intent and completion ordering, independent of frames and React. */
export function createToastSwipeController(options: {
  animate: (animation: ToastSwipeAnimation) => () => void
  onDismiss: () => void
}) {
  let dragged = false
  let canceled = false
  let exiting = false
  let generation = 0
  let stop: (() => void) | undefined
  function cancelAnimation() {
    generation++
    stop?.()
    stop = undefined
  }
  function run(target: number, kind: ToastSwipeAnimation['kind']) {
    cancelAnimation()
    const current = generation
    let completed = false
    stop = options.animate({
      target,
      kind,
      complete: () => {
        if (current !== generation || completed) return
        completed = true
        if (kind === 'dismiss') options.onDismiss()
      },
    })
  }
  function dismiss(direction = 1) {
    if (exiting) return
    exiting = true
    run(direction * 360, 'dismiss')
  }
  return {
    canOpen: () => !dragged && !exiting,
    pointerDown() {
      // A new pointer must not cancel an already committed dismissal.
      if (exiting) return
      cancelAnimation()
      dragged = false
      canceled = false
    },
    pointerCancel() {
      canceled = true
    },
    dragStart() {
      dragged = true
    },
    release(offset: number, velocity: number) {
      if (exiting) return
      if (!canceled && shouldDismissToast(offset, velocity))
        dismiss(Math.sign(offset))
      else run(0, 'return')
    },
    dismiss,
    cancelAnimation,
  }
}
