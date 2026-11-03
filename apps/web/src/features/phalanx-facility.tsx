import type { components } from '../contracts'
import { useGameScreen } from '../shell/screen-context'
import { ButtonLink } from '../ui/button'
import { galaxyTarget } from '../shell/galaxy-location'
import { ResourceQuantity } from '../ui/number-value'
import { phalanxRange, scanCost } from './phalanx-model'
export function PhalanxFacility({
  body,
}: {
  body: components['schemas']['BodyV3']
}) {
  const { universeName } = useGameScreen()
  const level = body.levels.SensorPhalanx ?? 0
  return (
    <section aria-label="Phalanx scanning">
      <h3>Planet scans</h3>
      <p>
        {level
          ? `Completed level ${level} reaches ${phalanxRange(level)} systems in either direction, within this galaxy.`
          : 'Complete level 1 to scan planets in this system.'}{' '}
        Each upgrade increases range to level² − 1.
      </p>
      <p>
        Each scan spends{' '}
        <ResourceQuantity resource="deuterium" value={scanCost} /> locally,
        including empty observations. Saved reports are free to reopen.
      </p>
      <ButtonLink
        variant="secondary"
        {...galaxyTarget(universeName, body.id, body.coordinates)}
      >
        Choose a planet in Galaxy
      </ButtonLink>
    </section>
  )
}
