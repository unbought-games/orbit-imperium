import {
  useCallback,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import {
  animate,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react'
import { lockSheetDocument, recessSheetSurface } from './action-sheet-effects'
import { useVisualViewport } from './use-visual-viewport'
import {
  DEFAULT_SHEET_STOPS,
  SHEET_HANDLE_HEIGHT,
  SHEET_PAINT_EXTENSION,
  SHEET_SPRINGS,
  sheetDepth,
  sheetHeight,
  sheetKeyboardTarget,
  sheetOffset,
  sheetPercent,
  sheetRelease,
  sheetStops,
  sheetTarget,
  type SheetMode,
  type SheetSpring,
} from './action-sheet-physics'

export type ActionSheetOptions = {
  open: boolean
  onOpenChange: (open: boolean) => void
  snapPoints?: readonly number[]
  initialSnap?: number
  mode?: SheetMode
  spring?: SheetSpring
  flickToDismiss?: boolean
  dim?: boolean
  depth?: boolean
  backgroundRef?: RefObject<HTMLElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
}

/** Owns interaction/lifecycle only. The caller owns open state and all form/game data. */
export function useActionSheet(options: ActionSheetOptions) {
  const viewport = useVisualViewport()
  const maxHeight = sheetHeight(viewport.height)
  const reduced = useReducedMotion() ?? false
  const points = sheetStops(options.snapPoints ?? DEFAULT_SHEET_STOPS)
  const mode = options.mode ?? 'snap'
  const dialog = useRef<HTMLDialogElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const internalClose = useRef(false)
  const unlock = useRef<(() => void) | null>(null)
  const restoreSurface = useRef<(() => void) | null>(null)
  const animation = useRef<ReturnType<typeof animate> | null>(null)
  const generation = useRef(0)
  // This is the user's requested stop, retained while viewport geometry changes.
  const requestedStop = useRef(options.initialSnap ?? 50)
  const dragOrigin = useRef(50)
  const dragGeneration = useRef(0)
  const focusFrame = useRef(0)
  const y = useMotionValue(maxHeight + SHEET_PAINT_EXTENSION)
  const controls = useDragControls()
  const latest = useRef({ options, maxHeight, reduced, points, mode })
  useLayoutEffect(() => {
    latest.current = { options, maxHeight, reduced, points, mode }
  })

  const visibleHeight = useTransform(y, (value) =>
    Math.max(0, maxHeight - value - SHEET_HANDLE_HEIGHT),
  )
  const opacity = useTransform(y, (value) =>
    options.dim === false
      ? 0
      : sheetDepth(sheetPercent(value, maxHeight), viewport.height, reduced)
          .opacity,
  )

  const stopAnimation = useCallback(() => {
    generation.current++
    animation.current?.stop()
  }, [])
  const settle = useCallback(
    (percent: number, velocity = 0) => {
      const { options, maxHeight, points, mode, reduced } = latest.current
      stopAnimation()
      const target = sheetTarget(percent, points, mode)
      requestedStop.current = target
      animation.current = animate(
        y,
        sheetOffset(target, maxHeight),
        reduced
          ? { duration: 0 }
          : {
              type: 'spring',
              ...SHEET_SPRINGS[options.spring ?? 'silky'],
              velocity,
            },
      )
      // Also runs after viewport changes, so an already-focused field remains
      // visible when the software keyboard reduces the available space.
      const token = generation.current
      void animation.current.then(() => {
        if (token !== generation.current || !latest.current.options.open) return
        cancelAnimationFrame(focusFrame.current)
        focusFrame.current = requestAnimationFrame(() => {
          const active = document.activeElement
          if (active instanceof HTMLElement && scroll.current?.contains(active))
            active.scrollIntoView({ block: 'nearest', behavior: 'instant' })
        })
      })
    },
    [stopAnimation, y],
  )
  const close = useCallback(
    () => latest.current.options.onOpenChange(false),
    [],
  )
  const finishClose = useCallback(() => {
    // Internal completion/unmount must not masquerade as a user dismissal.
    internalClose.current = true
    restoreSurface.current?.()
    restoreSurface.current = null
    dialog.current?.close()
    unlock.current?.()
    unlock.current = null
    if (opener.current?.isConnected)
      opener.current.focus({ preventScroll: true })
  }, [])

  const nativeClose = useCallback(
    (stillOpen: boolean) => {
      if (internalClose.current || stillOpen) return
      // A native dialog form can close before the controlled prop changes.
      // Release its document lock even though no exit animation remains to run.
      stopAnimation()
      finishClose()
      if (latest.current.options.open) close()
    },
    [stopAnimation, finishClose, close],
  )

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    controls.cancel()
    stopAnimation()
    if (options.open) {
      if (!element.open) {
        opener.current =
          options.returnFocusRef?.current ??
          (document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null)
        unlock.current = lockSheetDocument()
        y.set(maxHeight + SHEET_PAINT_EXTENSION)
        internalClose.current = false
        element.showModal()
        // The wrapper must never become the scrolling element (including on focus).
        element.scrollTop = 0
        if (scroll.current) scroll.current.scrollTop = 0
        handle.current?.focus({ preventScroll: true })
        settle(options.initialSnap ?? 50)
      } else {
        // Resize/reopen can interrupt an exit. Preserve the user's requested stop.
        settle(requestedStop.current)
      }
    } else if (element.open) {
      if (
        document.activeElement instanceof HTMLElement &&
        element.contains(document.activeElement)
      )
        document.activeElement.blur()
      const token = generation.current
      animation.current = animate(
        y,
        maxHeight + SHEET_PAINT_EXTENSION,
        reduced
          ? { duration: 0 }
          : { type: 'spring', stiffness: 430, damping: 44 },
      )
      void animation.current.then(() => {
        if (token === generation.current && !latest.current.options.open)
          finishClose()
      })
    } else {
      y.set(maxHeight + SHEET_PAINT_EXTENSION)
    }
  }, [
    options.open,
    maxHeight,
    reduced,
    controls,
    settle,
    stopAnimation,
    finishClose,
    y,
  ])

  // A changed set of stops is meaningful input, not a second copy of sheet height.
  const stopKey = points.join(',')
  useLayoutEffect(() => {
    if (options.open && dialog.current?.open) settle(requestedStop.current)
  }, [stopKey, mode, settle, options.open])

  useLayoutEffect(() => {
    const surface = options.backgroundRef?.current
    if (!surface || options.depth === false || !dialog.current?.open) return
    const restore = recessSheetSurface(
      surface,
      y,
      maxHeight,
      viewport.height,
      reduced,
    )
    restoreSurface.current = restore
    return () => {
      restore()
      restoreSurface.current = null
    }
  }, [
    options.open,
    options.backgroundRef,
    options.depth,
    maxHeight,
    viewport.height,
    reduced,
    y,
  ])

  useLayoutEffect(
    () => () => {
      stopAnimation()
      controls.cancel()
      cancelAnimationFrame(focusFrame.current)
      finishClose()
    },
    [stopAnimation, controls, finishClose],
  )

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!latest.current.options.open) return
    stopAnimation()
    dragGeneration.current = generation.current
    dragOrigin.current = sheetPercent(y.get(), latest.current.maxHeight)
    controls.start(event)
  }
  function release(
    _event: MouseEvent | TouchEvent | globalThis.PointerEvent,
    info: PanInfo,
  ) {
    const { options, maxHeight, points, mode } = latest.current
    if (!options.open || dragGeneration.current !== generation.current) return
    const result = sheetRelease({
      current: sheetPercent(y.get(), maxHeight),
      origin: dragOrigin.current,
      velocity: info.velocity.y,
      travel: info.offset.y,
      points,
      mode,
      flick: options.flickToDismiss !== false,
    })
    if ('dismiss' in result) close()
    else settle(result.height, mode === 'free' ? 0 : info.velocity.y)
  }
  function keyHandle(event: KeyboardEvent<HTMLButtonElement>) {
    const { points, mode, maxHeight } = latest.current
    const target = sheetKeyboardTarget(
      event.key,
      sheetPercent(y.get(), maxHeight),
      points,
      mode,
    )
    if (target === null) return
    event.preventDefault()
    controls.cancel()
    settle(target)
  }
  function focusContent(event: FocusEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const editable = target.matches(
      'input, textarea, select, [contenteditable="true"]',
    )
    const rect = target.getBoundingClientRect()
    const bounds = scroll.current?.getBoundingClientRect()
    if (
      editable ||
      (bounds && (rect.bottom > bounds.bottom || rect.top < bounds.top))
    ) {
      settle(latest.current.points[latest.current.points.length - 1])
    }
  }
  return {
    dialog,
    handle,
    scroll,
    viewport,
    maxHeight,
    y,
    opacity,
    visibleHeight,
    controls,
    startDrag,
    release,
    keyHandle,
    focusContent,
    close,
    nativeClose,
    snapTo: settle,
  }
}
