import { Button } from '../../ui/button'
import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, ArrowLeft } from 'lucide-react'
import { CatalogStage } from '../../ui/catalog-stage'
import { CatalogSection, ImageCatalog } from '../../ui/image-catalog'
import { label } from '../../ui/format'
import type { components } from '../../contracts'
import type { ProgressionProps } from './shared'
import { resourceBuildings } from './resource-buildings'
import { buildingUnavailableReason } from './building-availability'
import { requirementKey, technologyLevel } from './technology-dialog'
import { BuildingDetails } from './building-details'
import { Production } from './production'
import { WorkSummaries } from '../work-summaries'
import styles from './resources-page.module.css'
import { useProgressionOptions } from './use-progression-options'
import { buildingProgress } from '../../client-model/building-progress'
import { ProgressionTile } from './progression-tile'
export function ResourcesPage(props: ProgressionProps) {
  const { coordinator: model, view, body, selection } = props
  const progress = buildingProgress(model.store.getState(), body.id)
  const selectedId = selection.selectedId
  const selected = resourceBuildings.find(
    (building) => building.id === selectedId,
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const settingsPanel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (settingsOpen) settingsPanel.current?.focus({ preventScroll: true })
  }, [settingsOpen])
  function closeSettings() {
    setSettingsOpen(false)
    requestAnimationFrame(() =>
      settingsButton.current?.focus({ preventScroll: true }),
    )
  }
  const productionAvailable = view.progression.production.some(
    (x) => x.body === body.id,
  )

  return (
    <>
      {/* Keep production controls available for a later settings entry point. */}
      <div hidden>
        {productionAvailable && (
          <Button
            variant="secondary"
            ref={settingsButton}
            type="button"
            onClick={() => {
              selection.close()
              setSettingsOpen(true)
            }}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            Resource settings
          </Button>
        )}
      </div>
      <div hidden={settingsOpen}>
        {selected ? (
          <CatalogStage
            open
            detailKey={selected.id}
            detailLabel="Progression quote"
          >
            <ResourceInspector
              key={selected.id}
              {...props}
              building={selected}
            />
          </CatalogStage>
        ) : (
          <>
            <WorkSummaries
              view={view}
              body={body}
              currentPage="resources"
              layout="compact"
              only="buildings"
            />
            <CatalogSection title="Resource buildings">
              <ImageCatalog>
                {resourceBuildings.map((building) => {
                  const level =
                    body.levels[building.id as keyof typeof body.levels]
                  const catalog = view.catalog.find(
                    (c) =>
                      c.key.kind === 'Building' && c.key.id === building.id,
                  )
                  return (
                    <ProgressionTile
                      key={building.id}
                      model={model}
                      view={view}
                      request={{
                        type: 'Upgrade',
                        body: body.id,
                        building:
                          building.id as components['schemas']['BuildingId3'],
                      }}
                      title={label(building.id)}
                      aria-label={`Upgrade ${label(building.id)}`}
                      level={level ?? 0}
                      progress={
                        progress?.building === building.id ? progress : null
                      }
                      art={building.art}
                      locked={catalog?.requirements.some(
                        (r) =>
                          technologyLevel(requirementKey(r), props) < r.level,
                      )}
                      disabled={
                        !!buildingUnavailableReason(catalog, body, building.id)
                      }
                      disabledReason={buildingUnavailableReason(
                        catalog,
                        body,
                        building.id,
                      )}
                      {...selection.link(building.id)}
                    />
                  )
                })}
              </ImageCatalog>
            </CatalogSection>
          </>
        )}
      </div>
      <div
        hidden={!settingsOpen}
        ref={settingsPanel}
        tabIndex={-1}
        className={styles.settings}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault()
            closeSettings()
          }
        }}
      >
        <div className={styles.settingsHeader}>
          <h2>Resource settings</h2>
          <Button
            variant="secondary"
            type="button"
            size="icon-small"
            aria-label="Close resource settings"
            onClick={closeSettings}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Button>
        </div>
        {productionAvailable && <Production {...props} />}
      </div>
    </>
  )
}

function ResourceInspector({
  building,
  ...props
}: ProgressionProps & { building: (typeof resourceBuildings)[number] }) {
  const { coordinator: model, view, body } = props
  const progress = buildingProgress(model.store.getState(), body.id)
  const entry = view.catalog.find(
    (entry) => entry.key.kind === 'Building' && entry.key.id === building.id,
  )
  const [action, setAction] = useState<'Upgrade' | 'Demolition'>('Upgrade')
  const { proposal, loading, error, retry } = useProgressionOptions(
    model,
    view,
    !buildingUnavailableReason(entry, body, building.id) &&
      progress?.building !== building.id
      ? {
          type: action,
          body: body.id,
          building: building.id as components['schemas']['BuildingId3'],
        }
      : null,
  )
  return (
    <BuildingDetails
      {...props}
      building={building}
      level={body.levels[building.id as keyof typeof body.levels] ?? 0}
      proposal={proposal}
      loading={loading}
      error={error}
      action={action}
      onInspect={(type) => {
        setAction(type)
        retry()
      }}
    />
  )
}
