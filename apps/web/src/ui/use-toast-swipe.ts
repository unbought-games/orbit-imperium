import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { animate, useMotionValue, useTransform } from 'motion/react'
import type { PanInfo } from 'motion/react'
import { createToastSwipeController } from './toast-swipe'
import { useReducedMotion } from './use-reduced-motion'

const pointer = (event: ReactPointerEvent) => ({
  id: event.pointerId,
  x: event.clientX,
  y: event.clientY,
})

export function useToastSwipe(onDismiss: () => void) {
  const x = useMotionValue(0)
  const opacity = useTransform(x, [-280, 0, 280], [0, 1, 0])
  const reducedMotion = useReducedMotion()
  const latest = useRef({ onDismiss, reducedMotion })
  latest.current = { onDismiss, reducedMotion }
  const controller = useMemo(
    () =>
      createToastSwipeController({
        onDismiss: () => latest.current.onDismiss(),
        animate: ({ target, kind, complete }) => {
          const animation = animate(x, target, {
            ...(kind === 'dismiss'
              ? {
                  duration: latest.current.reducedMotion ? 0 : 0.18,
                  ease: 'easeOut' as const,
                }
              : latest.current.reducedMotion
                ? { duration: 0 }
                : { type: 'spring' as const, stiffness: 500, damping: 35 }),
            onComplete: complete,
          })
          return () => animation.stop()
        },
      }),
    [x],
  )
  useEffect(() => controller.cancelAnimation, [controller])
  return {
    x,
    opacity,
    dismiss: () => controller.dismiss(),
    canOpen: controller.canOpen,
    dragProps: {
      onPointerDownCapture: (event: ReactPointerEvent) => {
        if (event.isPrimary && event.button === 0)
          controller.pointerDown(pointer(event))
      },
      onPointerMoveCapture: (event: ReactPointerEvent) =>
        controller.pointerMove(pointer(event)),
      onPointerUpCapture: (event: ReactPointerEvent) =>
        controller.pointerUp(pointer(event)),
      onPointerCancelCapture: (event: ReactPointerEvent) =>
        controller.pointerCancel(event.pointerId),
      onDragStart: controller.dragStart,
      onDragEnd: (
        _event: PointerEvent | MouseEvent | TouchEvent,
        info: PanInfo,
      ) => controller.release(info.offset.x, info.velocity.x),
    },
  }
}
