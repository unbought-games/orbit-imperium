import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import {
  treatmentStyle,
  type TreatmentDefinition,
} from '../../client-model/cosmetic-treatment'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import styles from './cosmetic-treatment.module.css'
export function useTreatmentInteraction(
  treatment: TreatmentDefinition | null | undefined,
  quiet: boolean,
) {
  const reduced = useReducedMotion()
  const [active, setActive] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const still =
    quiet ||
    reduced ||
    (typeof navigator !== 'undefined' &&
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true)
  const interactive = !still && treatment?.renderer === 'interaction'
  const reset = (node: HTMLElement) => {
    node.style.setProperty('--tilt-x', '0deg')
    node.style.setProperty('--tilt-y', '0deg')
  }
  return {
    still,
    active,
    handlers: {
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!interactive || event.pointerType !== 'mouse') return
        const box = event.currentTarget.getBoundingClientRect(),
          x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
          y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
        const depth = Number(treatment.parameters.depth ?? 0)
        event.currentTarget.style.setProperty('--pointer-x', x * 100 + '%')
        event.currentTarget.style.setProperty('--pointer-y', y * 100 + '%')
        event.currentTarget.style.setProperty(
          '--tilt-x',
          (0.5 - y) * depth + 'deg',
        )
        event.currentTarget.style.setProperty(
          '--tilt-y',
          (x - 0.5) * depth + 'deg',
        )
      },
      onPointerLeave: (event: PointerEvent<HTMLElement>) =>
        reset(event.currentTarget),
      onPointerDown: () => {
        if (!interactive) return
        setActive(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(
          () => setActive(false),
          Number(treatment.parameters.duration_ms ?? 1000),
        )
      },
      onFocus: () => {
        if (interactive) setActive(true)
      },
      onBlur: () => setActive(false),
    },
  }
}
export function TreatmentLayer({
  treatment,
  quiet = false,
  active = false,
  className = '',
}: {
  treatment: TreatmentDefinition
  quiet?: boolean
  active?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.layer} ${className}`}
      data-family={treatment.renderer}
      data-pattern={String(treatment.parameters.pattern ?? 'plain')}
      data-still={quiet || undefined}
      data-active={active || undefined}
      style={treatmentStyle(treatment)}
    />
  )
}
export function TreatmentPreview({
  treatment,
  label,
  quiet = false,
}: {
  treatment: TreatmentDefinition
  label: string
  quiet?: boolean
}) {
  const motion = useTreatmentInteraction(treatment, quiet)
  return (
    <span
      role="img"
      aria-label={label}
      tabIndex={
        !motion.still && treatment.renderer === 'interaction' ? 0 : undefined
      }
      className={styles.preview}
      data-still={motion.still || undefined}
      data-pattern={String(treatment.parameters.pattern ?? 'plain')}
      data-active={motion.active || undefined}
      style={
        { '--sample-dye': treatment.sample_dye ?? '#b5ad9d' } as CSSProperties
      }
      {...motion.handlers}
    >
      <span className={styles.shape}>
        <TreatmentLayer
          treatment={treatment}
          quiet={motion.still}
          active={motion.active}
        />
        <span aria-hidden="true" className={styles.star}>
          ✦
        </span>
      </span>
    </span>
  )
}
