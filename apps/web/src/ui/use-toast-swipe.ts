import { useEffect, useRef } from 'react'
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import type { AnimationPlaybackControls, PanInfo } from 'motion/react'
import { shouldDismissToast } from './toast-swipe'

export function useToastSwipe(onDismiss: () => void) {
  const x = useMotionValue(0)
  const opacity = useTransform(x, [-280, 0, 280], [0, 1, 0])
  const reducedMotion = useReducedMotion()
  const dragged = useRef(false)
  const canceled = useRef(false)
  const exiting = useRef(false)
  const animation = useRef<AnimationPlaybackControls | null>(null)
  useEffect(() => () => animation.current?.stop(), [])

  function dismiss(direction: number) {
    if (exiting.current) return
    exiting.current = true
    animation.current?.stop()
    animation.current = animate(x, direction * 360, {
      duration: reducedMotion ? 0 : 0.18,
      ease: 'easeOut',
      onComplete: onDismiss,
    })
  }
  function release(
    _event: PointerEvent | MouseEvent | TouchEvent,
    info: PanInfo,
  ) {
    if (
      !canceled.current &&
      shouldDismissToast(info.offset.x, info.velocity.x)
    ) {
      dismiss(Math.sign(info.offset.x))
    } else {
      animation.current = animate(
        x,
        0,
        reducedMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 500, damping: 35 },
      )
    }
  }
  return {
    x,
    opacity,
    dismiss: () => dismiss(1),
    canOpen: () => !dragged.current && !exiting.current,
    dragProps: {
      onPointerDownCapture: () => {
        animation.current?.stop()
        dragged.current = false
        canceled.current = false
      },
      onPointerCancelCapture: () => {
        canceled.current = true
      },
      onDragStart: () => {
        dragged.current = true
      },
      onDragEnd: release,
    },
  }
}
