/** Travel prevents a jittery tap from becoming a fling. Velocity is px/second. */
export function shouldDismissToast(offset: number, velocity: number) {
  return (
    Math.abs(offset) >= 64 ||
    (Math.abs(offset) >= 18 &&
      Math.abs(velocity) >= 500 &&
      Math.sign(offset) === Math.sign(velocity))
  )
}

export type ToastPointer = { id: number; x: number; y: number }

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
  let pointer: ToastPointer | null = null
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
  function pointerMove(point: ToastPointer) {
    if (!pointer || point.id !== pointer.id) return
    // Match Motion's pan threshold, but observe input synchronously: its
    // onDragStart callback may arrive after pointerup and the native click.
    if (Math.hypot(point.x - pointer.x, point.y - pointer.y) >= 3)
      dragged = true
  }
  return {
    // Native keyboard and assistive clicks have no pointer gesture to reject.
    canOpen: (activation: 'pointer' | 'keyboard' = 'pointer') =>
      !exiting && (activation === 'keyboard' || (!dragged && !canceled)),
    pointerDown(point: ToastPointer) {
      // A new pointer must not cancel an already committed dismissal.
      if (exiting) return
      cancelAnimation()
      pointer = point
      dragged = false
      canceled = false
    },
    pointerMove,
    pointerUp(point: ToastPointer) {
      if (point.id !== pointer?.id) return
      pointerMove(point)
      pointer = null
    },
    pointerCancel(id: number) {
      if (id !== pointer?.id) return
      canceled = true
      pointer = null
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
