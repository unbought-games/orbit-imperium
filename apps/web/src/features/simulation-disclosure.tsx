import { useState, type ReactNode } from 'react'
import { useGameScreen } from '../shell/screen-context'

type Section =
  | 'import-defender'
  | 'defender-ships'
  | 'defender-defenses'
  | `allied-fleet-${number}-ships`
  | 'ranges'
  | 'survivors'
  | 'plan-attack'

export function SimulationDisclosure({
  section,
  initiallyOpen = true,
  summary,
  summaryClassName,
  className,
  children,
}: {
  section: Section
  initiallyOpen?: boolean
  summary: ReactNode
  summaryClassName?: string
  className: string
  children: ReactNode
}) {
  const { view } = useGameScreen()
  const key = `orbit:simulator:${view.binding.player}:${section}`
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved === 'true' || saved === 'false') return saved === 'true'
    } catch {
      // Browser storage may be unavailable.
    }
    return initiallyOpen
  })

  return (
    <details className={className} open={open}>
      <summary
        className={summaryClassName}
        onClick={(event) => {
          // Keyboard activation also clicks the native summary. Only an
          // explicit activation should persist a choice, never mounting it.
          event.preventDefault()
          setOpen(!open)
          try {
            localStorage.setItem(key, String(!open))
          } catch {
            // Keep the disclosure usable for this session.
          }
        }}
      >
        {summary}
      </summary>
      {children}
    </details>
  )
}
