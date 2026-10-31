import { useId } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import { useReducedMotion } from './use-reduced-motion'
import styles from './segmented-control.module.css'

/** One controlled value, with a shared selection plate that travels between options. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const id = useId()
  const reduced = useReducedMotion()
  return (
    <LayoutGroup id={id}>
      <div
        className={styles.control}
        role="group"
        aria-label={label}
        data-disabled={disabled || undefined}
      >
        {options.map((option) => (
          <motion.button
            key={option.value}
            type="button"
            className={styles.segment}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            whileTap={reduced || disabled ? undefined : { scale: 0.96 }}
            transition={{ duration: 0.12 }}
          >
            {value === option.value && (
              <motion.span
                className={styles.selection}
                data-segment-selection=""
                aria-hidden="true"
                layoutId={reduced ? undefined : 'selection'}
                initial={false}
                transition={{
                  type: 'spring',
                  stiffness: 520,
                  damping: 38,
                  mass: 0.7,
                }}
              >
                {!reduced && (
                  <motion.span
                    className={styles.sheen}
                    initial={{ x: '-120%', opacity: 0 }}
                    animate={{ x: '120%', opacity: [0, 0.45, 0] }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                )}
              </motion.span>
            )}
            <span className={styles.label}>{option.label}</span>
          </motion.button>
        ))}
      </div>
    </LayoutGroup>
  )
}
