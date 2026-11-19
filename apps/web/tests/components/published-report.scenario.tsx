import { PublishedReport } from '../../src/features/shared-report-page'
import type { SharedReport } from '../../src/adapters/report-sharing'
import { id } from '../../src/test-support/bootstrap'

export function PublishedReportScenario() {
  const coordinates = new URLSearchParams(location.search).has('coordinates')
  const observed = 1792692000000
  const report: SharedReport = {
    report: id(70),
    observed_at: observed,
    options: { include_identity: true, include_coordinates: coordinates },
    player_names: { 'participant-1': 'Commander Vega' },
    player_alliances: {
      'participant-1': {
        id: id(85),
        universe: id(3),
        name: 'Original alliance',
        tag: 'OLD',
      },
    },
    payload: {
      kind: 'Espionage',
      observed_at: observed,
      target: {
        owner: 'participant-1',
        kind: 'Planet',
        name: 'Historical planet',
        ...(coordinates
          ? { coordinates: { galaxy: 1, system: 2, position: 3 } }
          : {}),
      },
      resources: {
        visibility: 'Known',
        value: { metal: '100000000', crystal: '0', deuterium: '0' },
      },
      fleet: { visibility: 'Unknown' },
      defenses: { visibility: 'Unknown' },
      buildings: { visibility: 'Unknown' },
      research: { visibility: 'Unknown' },
      activity: { type: 'None' },
      counterespionage: { probability_ppm: 0, detected: false },
    },
  }
  return (
    <main>
      <PublishedReport report={report} />
    </main>
  )
}
