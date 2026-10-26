import { ShipComparison } from './ship-comparison'
import { useState } from 'react'
import { Network } from 'lucide-react'
import { CatalogStage } from '../../ui/catalog-stage'
import { CatalogSection, ImageCatalog } from '../../ui/image-catalog'
import { label } from '../../ui/format'
import { Button } from '../../ui/button'
import type { components } from '../../contracts'
import type { ProgressionProps } from './shared'
import {
  buildingUnavailableReason,
  visibleFacility,
} from './building-availability'
import { BuildingDetails } from './building-details'
import { TechnologyDetails } from './technology-details'
import { catalogContent, catalogGroup, facilityIds } from './catalog-content'
import {
  TechnologyDialog,
  requirementKey,
  technologyLevel,
} from './technology-dialog'
import { WorkSummaries } from '../work-summaries'
import styles from './technology-page.module.css'
import { technologyRequest } from './options'
import { useProgressionOptions } from './use-progression-options'
import { buildingProgress } from '../../client-model/building-progress'
import { researchProgress } from '../../client-model/research-progress'
import { ProgressionTile } from './progression-tile'
type Entry = components['schemas']['CatalogEntry3']
export function TechnologyPage(props: ProgressionProps) {
  const { view, body, page, coordinator: model, selection } = props
  const progress = buildingProgress(model.store.getState(), body.id)
  const research = researchProgress(model.store.getState())
  const selected = view.catalog.find(
    (entry) => entry.key.id === selection.selectedId,
  )
  const kind =
    page === 'facilities'
      ? 'Building'
      : page === 'research'
        ? 'Research'
        : page === 'shipyard'
          ? 'Ship'
          : 'Defense'
  const entries = view.catalog.filter(
    (x) =>
      x.key.kind === kind &&
      (kind !== 'Building' ||
        (facilityIds.includes(x.key.id) && visibleFacility(x, body))),
  )
  const groups = [...new Set(entries.map((x) => catalogGroup(x.key)))].sort(
    (a, b) =>
      [
        'Facility buildings',
        'Basic research',
        'Drive research',
        'Advanced research',
        'Combat research',
        'Combat ships',
        'Civil ships',
        'Defensive structures',
      ].indexOf(a) -
      [
        'Facility buildings',
        'Basic research',
        'Drive research',
        'Advanced research',
        'Combat research',
        'Combat ships',
        'Civil ships',
        'Defensive structures',
      ].indexOf(b),
  )
  const confirmedBody =
    model.store.getState().view?.bodies.find((x) => x.id === body.id) ?? body
  function count(entry: Entry) {
    return entry.key.kind === 'Ship' || entry.key.kind === 'Defense'
      ? (confirmedBody.inventories.find(
          (x) => x.item.kind === entry.key.kind && x.item.id === entry.key.id,
        )?.count ?? '0')
      : technologyLevel(entry.key, props)
  }
  if (selected) {
    return (
      <CatalogStage
        open
        detailKey={selected.key.id}
        detailLabel="Progression quote"
      >
        <TechnologyInspector
          key={selected.key.id}
          {...props}
          selected={selected}
          count={count(selected)}
        />
      </CatalogStage>
    )
  }
  return (
    <>
      <WorkSummaries
        view={view}
        body={body}
        currentPage={page}
        layout="compact"
        only={
          page === 'facilities'
            ? 'buildings'
            : page === 'research'
              ? 'research'
              : 'manufacturing'
        }
      />
      <div className={groups.length > 1 ? styles.groups : undefined}>
        {groups.map((group) => (
          <CatalogSection title={group} key={group}>
            <ImageCatalog
              columns={
                group === 'Basic research' || group === 'Advanced research'
                  ? 5
                  : group === 'Drive research' ||
                      group === 'Combat research' ||
                      group === 'Civil ships'
                    ? 3
                    : group === 'Combat ships'
                      ? 4
                      : 6
              }
            >
              {entries
                .filter((x) => catalogGroup(x.key) === group)
                .map((entry) => {
                  const locked = entry.requirements.some(
                    (r) => technologyLevel(requirementKey(r), props) < r.level,
                  )
                  const verb =
                    kind === 'Building'
                      ? 'Upgrade'
                      : kind === 'Research'
                        ? 'Research'
                        : 'Build'
                  return (
                    <ProgressionTile
                      key={entry.key.id}
                      model={model}
                      view={view}
                      request={
                        entry.key.kind === 'Building'
                          ? {
                              type: 'Upgrade',
                              body: body.id,
                              building: entry.key.id,
                            }
                          : null
                      }
                      title={label(entry.key.id)}
                      aria-label={`${verb} ${label(entry.key.id)}`}
                      art={catalogContent(entry.key).art}
                      level={count(entry)}
                      progress={
                        entry.key.kind === 'Building' &&
                        progress?.building === entry.key.id
                          ? progress
                          : entry.key.kind === 'Research' &&
                              research?.research === entry.key.id
                            ? { ...research, direction: 'up', kind: 'research' }
                            : null
                      }
                      countLabel={
                        kind === 'Ship' || kind === 'Defense'
                          ? 'Stationed'
                          : 'Level'
                      }
                      locked={locked}
                      disabled={
                        entry.key.kind === 'Building'
                          ? !!buildingUnavailableReason(entry, body)
                          : !entry.enabled ||
                            !entry.body_kinds.includes(body.kind)
                      }
                      disabledReason={
                        entry.key.kind === 'Building'
                          ? buildingUnavailableReason(entry, body)
                          : !entry.enabled
                            ? 'unavailable in this universe'
                            : `unavailable on this ${body.kind.toLowerCase()}`
                      }
                      {...selection.link(entry.key.id)}
                    />
                  )
                })}
            </ImageCatalog>
          </CatalogSection>
        ))}
      </div>
      {!entries.length && <p>No catalog is available for this planet.</p>}
      {page === 'shipyard' && (
        <ShipComparison catalog={view.catalog} research={view.research} />
      )}
    </>
  )
}

function TechnologyInspector({
  selected,
  count,
  ...props
}: ProgressionProps & { selected: Entry; count: number | string }) {
  const { view, body, coordinator: model } = props
  const progress = buildingProgress(model.store.getState(), body.id)
  const research = researchProgress(model.store.getState())
  const [technology, setTechnology] = useState(false)
  const [action, setAction] = useState<'Upgrade' | 'Demolition'>('Upgrade')
  const [quantity, setQuantity] = useState('1')
  const request =
    selected.enabled &&
    selected.body_kinds.includes(body.kind) &&
    !(
      selected.key.kind === 'Building' &&
      buildingUnavailableReason(selected, body)
    ) &&
    !(
      selected.key.kind === 'Building' && progress?.building === selected.key.id
    ) &&
    !(
      selected.key.kind === 'Research' && research?.research === selected.key.id
    )
      ? technologyRequest(selected.key, body.id, action, '1')
      : null
  const {
    proposal,
    loading,
    error: requestError,
    retry,
  } = useProgressionOptions(model, view, request)
  function inspect(nextAction: 'Upgrade' | 'Demolition' = 'Upgrade') {
    setAction(nextAction)
    retry()
  }
  return (
    <>
      {selected.key.kind === 'Building' ? (
        <>
          <BuildingDetails
            {...props}
            building={catalogContent(selected.key)}
            level={Number(count)}
            proposal={proposal}
            loading={loading}
            error={requestError}
            action={action}
            onInspect={inspect}
          />
          <Button
            className={styles.treeButton}
            variant="secondary"
            onClick={() => setTechnology(true)}
          >
            <Network size={16} />
            Technology tree
          </Button>
        </>
      ) : (
        <TechnologyDetails
          {...props}
          entry={selected}
          count={count}
          proposal={proposal}
          loading={loading}
          error={requestError}
          quantity={quantity}
          onQuantity={setQuantity}
          onInspect={() => inspect()}
          onTechnology={() => setTechnology(true)}
        />
      )}
      {selected.key.kind === 'Ship' && (
        <ShipComparison
          catalog={view.catalog}
          research={view.research}
          initialShipId={selected.key.id}
        />
      )}
      {technology && (
        <TechnologyDialog
          {...props}
          entry={selected}
          onClose={() => setTechnology(false)}
        />
      )}
    </>
  )
}
