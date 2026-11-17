import { ShipyardDetailLayout } from './shipyard-detail-layout'
import { useShipAppearances } from '../../shell/ship-appearances-context'
import { useShipCustomizationLaunch } from '../../shell/ship-customization-launch-context'
import { Text } from '../../ui/typography'
import type { ProgressionProps } from '../progression/shared'
import { TechnologyInspector } from '../progression/technology-page'
import {
  requirementKey,
  technologyLevel,
} from '../progression/technology-dialog'
import { compareShips } from '../ship-order'
import { ShipyardSelectionRail } from './shipyard-selection-rail'
import { WorkSummaries } from '../work-summaries'
import {
  canCustomizeShip,
  shipAppearancesForOwner,
} from './ship-appearance-art'
import { ShipAppearanceImage } from './ship-appearance-image'
import styles from './shipyard.module.css'

/** Mounted by Progression only behind shipCustomizationEnabled. */
export function ShipyardPage(props: ProgressionProps) {
  const { view, body, coordinator, selection } = props
  const { snapshot } = useShipAppearances()
  const { open } = useShipCustomizationLaunch()
  const appearance = shipAppearancesForOwner(snapshot, view.binding)
  const entries = view.catalog
    .filter((entry) => entry.key.kind === 'Ship')
    .sort(compareShips)
  const selected = entries.find(
    (entry) => entry.key.id === selection.selectedId,
  )
  const confirmedBody =
    coordinator.store
      .getState()
      .view?.bodies.find((item) => item.id === body.id) ?? body
  const count = (id: string) =>
    confirmedBody.inventories.find(
      (item) => item.item.kind === 'Ship' && item.item.id === id,
    )?.count ?? '0'
  return (
    <>
      <WorkSummaries
        view={view}
        body={body}
        currentPage="shipyard"
        layout="compact"
        only="manufacturing"
      />
      {body.kind === 'Moon' &&
        !entries.some(
          (entry) => entry.enabled && entry.body_kinds.includes(body.kind),
        ) && (
          <p role="status">
            Manufacturing on moons is not available yet. You can inspect the
            catalog.
          </p>
        )}
      <div className={styles.yard}>
        <ShipyardSelectionRail
          entries={entries}
          selection={selection}
          equipment={appearance?.equipment}
          count={count}
          status={(entry) => {
            if (!entry.enabled || !entry.body_kinds.includes(body.kind))
              return 'Unavailable here'
            return entry.requirements.some(
              (requirement) =>
                technologyLevel(requirementKey(requirement), props) <
                requirement.level,
            )
              ? 'Requirements needed'
              : ''
          }}
        />
        <div className={styles.selected}>
          {selected ? (
            <TechnologyInspector
              key={selected.key.id}
              {...props}
              selected={selected}
              count={count(selected.key.id)}
              renderLayout={(layout) => (
                <ShipyardDetailLayout
                  {...layout}
                  artwork={
                    <ShipAppearanceImage
                      item={selected.key}
                      equipment={appearance?.equipment}
                      className={styles.hero}
                      sizes="(max-width: 767px) 90vw, 45vw"
                    />
                  }
                  customize={
                    canCustomizeShip(appearance, selected.key.id)
                      ? () => open(selected.key.id)
                      : undefined
                  }
                />
              )}
            />
          ) : (
            <div className={styles.empty}>
              <h2>
                {entries.length
                  ? 'Choose your next ship'
                  : 'No ships available'}
              </h2>
              <Text>
                {entries.length
                  ? 'Select a craft to see its capabilities, review the cost, and place an order.'
                  : 'No ship catalog is available for this body.'}
              </Text>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
