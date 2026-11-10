// Test-only entry: renders the production component and stylesheet without
// application bootstrap, router or network-backed game/profile providers.
import '../../src/style.css'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ReportCleanupScenario } from './report-cleanup'
import { ReportObservation } from '../../src/features/report-observation'
import {
  deliveredReport,
  harvestReport,
  sharedCombatReport,
} from './report-data'

const scenario = new URL(location.href).searchParams.get('scenario')
const shared = scenario?.startsWith('shared-combat-') ?? false
const visible = scenario === 'shared-combat-visible'
const payload =
  scenario === 'delivered'
    ? deliveredReport
    : scenario === 'harvest'
      ? harvestReport
      : shared
        ? sharedCombatReport(visible)
        : null
if (!payload && scenario !== 'cleanup')
  throw Error(`Unknown report component scenario: ${scenario}`)
flushSync(() =>
  createRoot(document.getElementById('root')!).render(
    scenario === 'cleanup' ? (
      <ReportCleanupScenario />
    ) : (
      <main>
        <ReportObservation
          payload={payload!}
          shared={shared}
          playerNames={
            visible
              ? { attacker: 'Vega', defender: 'Sol' }
              : { attacker: 'Player 1', defender: 'Player 2' }
          }
        />
      </main>
    ),
  ),
)
document.documentElement.dataset.componentReady = scenario!
