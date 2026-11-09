import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../ui/button'
import { resolvePlanetArt } from '../../ui/artwork'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import styles from './arrival.module.css'

/** Swipe or step through planet looks; the centered look is the selection. */
export function PlanetCarousel({
  options,
  value,
  onChange,
  labelledBy,
}: {
  options: readonly number[]
  value: number
  onChange: (slot: number) => void
  labelledBy: string
}) {
  const track = useRef<HTMLUListElement>(null)
  // A button or key press scrolls through intermediate looks; ignore them.
  const target = useRef<number | null>(null)
  const reduced = useReducedMotion()
  const index = Math.max(0, options.indexOf(value))
  const show = (next: number, smooth = !reduced) => {
    const item = track.current?.children[next] as HTMLElement | undefined
    const list = track.current
    if (!item || !list) return
    list.scrollTo({
      left: item.offsetLeft - (list.clientWidth - item.clientWidth) / 2,
      behavior: smooth ? 'smooth' : 'auto',
    })
  }
  const select = (next: number) => {
    const bounded = Math.min(options.length - 1, Math.max(0, next))
    target.current = bounded
    onChange(options[bounded])
    show(bounded)
  }
  useEffect(() => {
    show(index, false)
    // Only align the initial selection; later changes come from the player.
  }, [])
  const centered = () => {
    const list = track.current
    if (!list) return
    const middle = list.scrollLeft + list.clientWidth / 2
    let nearest = 0
    Array.from(list.children).forEach((child, i) => {
      const item = child as HTMLElement
      const distance = Math.abs(item.offsetLeft + item.clientWidth / 2 - middle)
      const best = list.children[nearest] as HTMLElement
      if (distance < Math.abs(best.offsetLeft + best.clientWidth / 2 - middle))
        nearest = i
    })
    if (target.current !== null) {
      if (nearest === target.current) target.current = null
      return
    }
    if (options[nearest] !== value) onChange(options[nearest])
  }
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      select(index + (event.key === 'ArrowRight' ? 1 : -1))
    }
  }
  return (
    <div
      className={styles.carousel}
      role="group"
      aria-roledescription="carousel"
      aria-labelledby={labelledBy}
    >
      <ul
        ref={track}
        className={styles.track}
        tabIndex={0}
        aria-label={`Planet look ${index + 1} of ${options.length}`}
        onScroll={centered}
        onKeyDown={keys}
        onPointerDown={() => (target.current = null)}
        onWheel={() => (target.current = null)}
      >
        {options.map((slot, i) => {
          const art = resolvePlanetArt(slot)
          return (
            <li
              key={slot}
              className={styles.planet}
              data-selected={i === index || undefined}
              aria-hidden={i !== index}
            >
              <img
                src={art.src}
                srcSet={art.srcSet}
                sizes="(max-width: 600px) 64vw, 340px"
                width={art.width}
                height={art.height}
                alt=""
                draggable={false}
                loading={Math.abs(i - index) <= 1 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </li>
          )
        })}
      </ul>
      <div className={styles.carouselControls}>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label="Previous planet look"
          disabled={index === 0}
          onClick={() => select(index - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <div className={styles.dots}>
          {options.map((slot, i) => (
            <button
              key={slot}
              type="button"
              className={styles.dot}
              aria-label={`Planet look ${i + 1} of ${options.length}`}
              aria-current={i === index || undefined}
              onClick={() => select(i)}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label="Next planet look"
          disabled={index === options.length - 1}
          onClick={() => select(index + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
