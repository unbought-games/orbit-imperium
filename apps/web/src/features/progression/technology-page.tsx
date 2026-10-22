import { useEffect, useRef, useState } from 'react'
import { Network } from 'lucide-react'
import { CatalogStage } from '../../ui/catalog-stage'
import { CatalogSection, ImageCatalog } from '../../ui/image-catalog'
import { label } from '../../ui/format'
import { Button } from '../../ui/button'
import type { components } from '../../contracts'
import type { ProgressionProps } from './shared'
import { buildingUnavailableReason } from './building-availability'
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
import { ProgressionHeading, TechnologyWorld } from './progression-world'
type Entry = components['schemas']['CatalogEntry3']
export function TechnologyPage(props: ProgressionProps) {
  const { view, body, page, coordinator: model } = props
  const progress = buildingProgress(model.store.getState(), body.id)
  const research = researchProgress(model.store.getState())
  const [selectedKey, setSelectedKey] = useState<Entry['key'] | null>(null)
  const selected = view.catalog.find(
    (entry) =>
      entry.key.kind === selectedKey?.kind && entry.key.id === selectedKey.id,
  )
  const [open, setOpen] = useState(false)
  const [technology, setTechnology] = useState(false)
  const [action, setAction] = useState<'Upgrade' | 'Demolition'>('Upgrade')
  const [quantity, setQuantity] = useState('1')
  const request =
    selected &&
    open &&
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
  const error =
    selected &&
    open &&
    !technologyRequest(selected.key, body.id, action, quantity) &&
    (selected.key.kind === 'Ship' || selected.key.kind === 'Defense')
      ? 'Enter a positive whole quantity within the supported range.'
      : requestError
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) return
    const frame = requestAnimationFrame(() =>
      opener.current?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [open])
  function close() {
    setOpen(false)
    setTechnology(false)
  }
  function inspect(nextAction: 'Upgrade' | 'Demolition' = 'Upgrade') {
    setAction(nextAction)
    retry()
  }
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
      (kind !== 'Building' || facilityIds.includes(x.key.id)),
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
  return (
    <>
      <ProgressionHeading page={page} body={body} compact={open} />
      <CatalogStage
        scene={
          <TechnologyWorld
            entries={entries}
            body={body}
            page={page}
            onSelect={(entry, element) => {
              opener.current = element
              setSelectedKey(entry.key)
              setOpen(true)
              setQuantity('1')
              inspect('Upgrade')
            }}
          />
        }
        sceneLabel={`${label(page)} colony`}
        open={open}
        detailKey={`${selected?.key.id}:${action}`}
        detailLabel="Progression quote"
        onClose={close}
        footer={
          page !== 'facilities' && (
            <span>
              {kind === 'Research'
                ? 'Research applies to all your planets.'
                : `Planet [${body.coordinates.galaxy}:${body.coordinates.system}:${body.coordinates.position}]`}
            </span>
          )
        }
      >
        {selected &&
          (selected.key.kind === 'Building' ? (
            <>
              <BuildingDetails
                {...props}
                building={catalogContent(selected.key)}
                level={Number(count(selected))}
                proposal={proposal}
                loading={loading}
                error={error}
                action={action}
                onInspect={inspect}
                onClose={close}
              />
              <Button
                className={styles.treeButton}
                variant="quiet"
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
              count={count(selected)}
              proposal={proposal}
              loading={loading}
              error={error}
              quantity={quantity}
              onQuantity={setQuantity}
              onInspect={() => inspect()}
              onClose={close}
              onTechnology={() => setTechnology(true)}
            />
          ))}
      </CatalogStage>
      <WorkSummaries
        view={view}
        body={body}
        currentPage={page}
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
                      selected={open && entry.key.id === selected?.key.id}
                      onClick={(event) => {
                        if (open && selected?.key.id === entry.key.id) {
                          close()
                          return
                        }
                        opener.current = event.currentTarget
                        setSelectedKey(entry.key)
                        setOpen(true)
                        setQuantity('1')
                        inspect('Upgrade')
                      }}
                    />
                  )
                })}
            </ImageCatalog>
          </CatalogSection>
        ))}
      </div>
      {!entries.length && <p>No catalog is available for this planet.</p>}
      {technology && selected && (
        <TechnologyDialog
          {...props}
          entry={selected}
          onClose={() => setTechnology(false)}
        />
      )}
    </>
  )
}
