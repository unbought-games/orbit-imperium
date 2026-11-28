import { ReportObservation } from '../../src/features/report-observation'
import { id } from '../../src/test-support/bootstrap'
import { combatObservation } from '../fixtures/combat-observation'
import { ReaderWidth } from './report-reader.scenarios'

const loot = { metal: '1000000000', crystal: '0', deuterium: '0' }
export function AlliedReturnScenario() {
  return (
    <ReaderWidth>
      <ReportObservation
        viewer={id(2)}
        payload={{
          ...combatObservation(false),
          own_returns: [
            {
              fleet: id(70),
              origin: { galaxy: 1, system: 371, position: 12 },
              return_at: 1793487000000,
              loot,
            },
            {
              fleet: id(72),
              origin: { galaxy: 1, system: 8, position: 9 },
              return_at: 1793486520000,
              loot,
            },
          ],
        }}
      />
    </ReaderWidth>
  )
}
