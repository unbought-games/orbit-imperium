import type { MotionValue } from 'motion/react'
import { sheetDepth, sheetPercent } from './action-sheet-physics'

/** Freeze the document for iOS as well as desktop; restore the exact position/styles. */
export function lockSheetDocument() {
  const x = window.scrollX,
    y = window.scrollY
  const body = document.body
  const properties = ['position', 'top', 'left', 'width', 'overflow'] as const
  const previous = properties.map(
    (property) => [property, body.style[property]] as const,
  )
  const overflow = document.documentElement.style.overflow
  Object.assign(body.style, {
    position: 'fixed',
    top: `${-y}px`,
    left: `${-x}px`,
    width: '100%',
    overflow: 'hidden',
  })
  document.documentElement.style.overflow = 'hidden'
  return () => {
    for (const [property, value] of previous) body.style[property] = value
    document.documentElement.style.overflow = overflow
    window.scrollTo(x, y)
  }
}

/** Only touch the explicitly supplied viewport surface; never search for application DOM. */
export function recessSheetSurface(
  surface: HTMLElement,
  y: MotionValue<number>,
  height: number,
  viewportHeight: number,
  reduced: boolean,
) {
  const properties = [
    'transform',
    'transformOrigin',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'willChange',
  ] as const
  const previous = properties.map(
    (property) => [property, surface.style[property]] as const,
  )
  surface.style.transformOrigin = '50% 100%'
  surface.style.willChange = 'transform'
  const update = () => {
    const depth = sheetDepth(
      sheetPercent(y.get(), height),
      viewportHeight,
      reduced,
    )
    surface.style.transform = `scale(${depth.scaleX}, ${depth.scaleY})`
    surface.style.borderTopLeftRadius = `${depth.radius}px`
    surface.style.borderTopRightRadius = `${depth.radius}px`
  }
  const unsubscribe = y.on('change', update)
  update()
  return () => {
    unsubscribe()
    for (const [property, value] of previous) surface.style[property] = value
  }
}
