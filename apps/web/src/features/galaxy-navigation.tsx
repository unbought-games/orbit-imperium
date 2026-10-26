import { useEffect, useId, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { Field, NumberInput } from '../ui/form'
import styles from './galaxy.module.css'

export function parseGalaxyCoordinate(value: string, maximum: number) {
  const trimmed = value.trim()
  const number = Number(trimmed)
  return /^\d+$/.test(trimmed) &&
    Number.isSafeInteger(number) &&
    number >= 1 &&
    number <= maximum
    ? number
    : null
}

export function GalaxyNavigation({
  galaxy,
  system,
  galaxies,
  systems,
  browse,
}: {
  galaxy: number
  system: number
  galaxies: number
  systems: number
  browse: (galaxy: number, system: number) => void
}) {
  // Only user edits live here; the URL remains the committed source of truth.
  const [edits, setEdits] = useState<{ galaxy?: string; system?: string }>({})
  const [submitted, setSubmitted] = useState(false)
  const errorId = useId()
  const location = useLocation({ select: (location) => location.href })
  useEffect(() => {
    setEdits({})
    setSubmitted(false)
  }, [galaxy, system, location])
  const galaxyText = edits.galaxy ?? String(galaxy)
  const systemText = edits.system ?? String(system)
  const nextGalaxy = parseGalaxyCoordinate(galaxyText, galaxies)
  const nextSystem = parseGalaxyCoordinate(systemText, systems)
  const invalidGalaxy = submitted && nextGalaxy === null
  const invalidSystem = submitted && nextSystem === null
  const reset = () => {
    setEdits({})
    setSubmitted(false)
  }
  return (
    <form
      className={styles.toolbar}
      data-galaxy-navigation
      role="group"
      aria-label="Galaxy controls"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        if (nextGalaxy !== null && nextSystem !== null) {
          browse(nextGalaxy, nextSystem)
          reset()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          reset()
        }
      }}
    >
      <Field className={styles.coordinateField}>
        <span>Galaxy</span>
        <NumberInput
          value={galaxyText}
          aria-invalid={invalidGalaxy}
          aria-describedby={invalidGalaxy ? errorId : undefined}
          title={`Galaxy (1–${galaxies})`}
          autoComplete="off"
          enterKeyHint="go"
          onChange={(event) =>
            setEdits((previous) => ({
              ...previous,
              galaxy: event.target.value,
            }))
          }
        />
      </Field>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Previous system"
        title="Previous system"
        disabled={
          galaxy < 1 || galaxy > galaxies || system <= 1 || system > systems
        }
        onClick={() => {
          reset()
          browse(galaxy, system - 1)
        }}
      >
        <ChevronLeft size={18} />
      </Button>
      <Field className={styles.coordinateField}>
        <span>System</span>
        <NumberInput
          aria-label="Solar system"
          value={systemText}
          aria-invalid={invalidSystem}
          aria-describedby={invalidSystem ? errorId : undefined}
          title={`System (1–${systems})`}
          autoComplete="off"
          enterKeyHint="go"
          onChange={(event) =>
            setEdits((previous) => ({
              ...previous,
              system: event.target.value,
            }))
          }
        />
      </Field>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Next system"
        title="Next system"
        disabled={
          galaxy < 1 || galaxy > galaxies || system < 1 || system >= systems
        }
        onClick={() => {
          reset()
          browse(galaxy, system + 1)
        }}
      >
        <ChevronRight size={18} />
      </Button>
      <Button type="submit" variant="secondary">
        Go
      </Button>
      {(invalidGalaxy || invalidSystem) && (
        <p id={errorId} role="alert" className={styles.coordinateError}>
          {invalidGalaxy &&
            `Enter a whole galaxy number from 1 to ${galaxies}. `}
          {invalidSystem && `Enter a whole system number from 1 to ${systems}.`}
        </p>
      )}
    </form>
  )
}
