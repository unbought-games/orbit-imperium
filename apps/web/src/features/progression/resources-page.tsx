import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, ArrowLeft } from 'lucide-react'
import { CatalogStage } from '../../ui/catalog-stage'
import { CatalogSection, ImageCatalog } from '../../ui/image-catalog'
import { label } from '../../ui/format'
import type { components } from '../../contracts'
import type { ProgressionProps } from './shared'
import { resourceBuildings } from './resource-buildings'
import { BuildingDetails } from './building-details'
import { Production } from './production'
import { WorkSummaries } from '../work-summaries'
import styles from './resources-page.module.css'
import { useProgressionOptions } from './use-progression-options'
import { buildingProgress } from '../../client-model/building-progress'
import { ProgressionTile } from './progression-tile'
import { ProgressionHeading, ResourceWorld } from './progression-world'
export function ResourcesPage(props: ProgressionProps) {
  const { coordinator: model, view, body } = props
  const progress = buildingProgress(model.store.getState(), body.id)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = resourceBuildings.find(
    (building) => building.id === selectedId,
  )
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [action, setAction] = useState<'Upgrade' | 'Demolition'>('Upgrade')
  const { proposal, loading, error, retry } = useProgressionOptions(
    model,
    view,
    open && selected && progress?.building !== selected.id
      ? {
          type: action,
          body: body.id,
          building: selected.id as components['schemas']['BuildingId3'],
        }
      : null,
  )
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) return
    const frame = requestAnimationFrame(() =>
      opener.current?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [open])
  const settingsButton = useRef<HTMLButtonElement>(null)
  const settingsPanel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (settingsOpen) settingsPanel.current?.focus({ preventScroll: true })
  }, [settingsOpen])
  function closeDetails() {
    setOpen(false)
  }
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
      <ProgressionHeading
        page="resources"
        body={body}
        compact={open || settingsOpen}
      />
      <div hidden={settingsOpen}>
        <CatalogStage
          scene={
            <ResourceWorld
              view={view}
              body={body}
              onSelect={(id, element) => {
                opener.current = element
                setSelectedId(id)
                setOpen(true)
                setAction('Upgrade')
                retry()
              }}
            />
          }
          sceneLabel="Industrial resource colony"
          open={open}
          detailKey={`${selected?.id}:${action}`}
          detailLabel="Progression quote"
          onClose={closeDetails}
          footer={
            <>
              <span>
                Production, storage and energy · {body.fields_used} /{' '}
                {body.fields} fields
              </span>
              <button
                ref={settingsButton}
                type="button"
                className={styles.settingsButton}
                disabled={!productionAvailable}
                onClick={() => {
                  setOpen(false)
                  setSettingsOpen(true)
                }}
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                Resource settings
              </button>
            </>
          }
        >
          {selected && (
            <BuildingDetails
              {...props}
              building={selected}
              level={body.levels[selected.id as keyof typeof body.levels] ?? 0}
              proposal={proposal}
              loading={loading}
              error={error}
              action={action}
              onInspect={(type) => {
                setAction(type)
                retry()
              }}
              onClose={closeDetails}
            />
          )}
        </CatalogStage>
        <WorkSummaries view={view} body={body} includeResearch={false} />
        <CatalogSection title="Resource buildings">
          <ImageCatalog>
            {resourceBuildings.map((building) => {
              const level = body.levels[building.id as keyof typeof body.levels]
              const catalog = view.catalog.find(
                (c) => c.key.kind === 'Building' && c.key.id === building.id,
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
                  selected={open && selected?.id === building.id}
                  disabled={level === undefined || catalog?.enabled === false}
                  disabledReason="unavailable in this universe"
                  onClick={(event) => {
                    if (open && selected?.id === building.id) {
                      closeDetails()
                      return
                    }
                    opener.current = event.currentTarget
                    setSelectedId(building.id)
                    setOpen(true)
                    setAction('Upgrade')
                    retry()
                  }}
                />
              )
            })}
          </ImageCatalog>
        </CatalogSection>
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
          <button
            type="button"
            aria-label="Close resource settings"
            onClick={closeSettings}
          >
            <ArrowLeft size={18} /> Back
          </button>
        </div>
        {productionAvailable && <Production {...props} />}
      </div>
    </>
  )
}
