import { useState } from 'react'
import { Settings } from 'lucide-react'
import { ButtonLink } from '../../ui/button'
import { useGameScreen } from '../../shell/screen-context'
import { routeTarget } from '../../shell/route-target'
import { CatalogStage } from '../../ui/catalog-stage'
import { CatalogSection, ImageCatalog } from '../../ui/image-catalog'
import { label } from '../../ui/format'
import type { components } from '../../contracts'
import type { ProgressionProps } from './shared'
import { resourceBuildings } from './resource-buildings'
import { buildingUnavailableReason } from './building-availability'
import { requirementKey, technologyLevel } from './technology-dialog'
import { BuildingDetails } from './building-details'
import { WorkSummaries } from '../work-summaries'
import { useProgressionOptions } from './use-progression-options'
import { buildingProgress } from '../../client-model/building-progress'
import { ProgressionTile } from './progression-tile'
export function ResourcesPage(props: ProgressionProps) {
  const { coordinator: model, view, body, selection } = props
  const { universeName } = useGameScreen()
  const progress = buildingProgress(model.store.getState(), body.id)
  const selectedId = selection.selectedId
  const selected = resourceBuildings.find(
    (building) => building.id === selectedId,
  )
  if (selected)
    return (
      <CatalogStage
        open
        detailKey={selected.id}
        detailLabel="Progression quote"
      >
        <ResourceInspector key={selected.id} {...props} building={selected} />
      </CatalogStage>
    )
  return (
    <>
      <WorkSummaries
        view={view}
        body={body}
        currentPage="resources"
        layout="compact"
        only="buildings"
      />
      <CatalogSection
        title="Resource buildings"
        actions={
          <ButtonLink
            variant="ghost"
            size="icon-small"
            aria-label="Resource settings"
            title="Resource settings"
            {...routeTarget(universeName, 'resource-settings', body.id)}
          >
            <Settings size={14} aria-hidden="true" />
          </ButtonLink>
        }
      >
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
                  building: building.id as components['schemas']['BuildingId3'],
                }}
                title={label(building.id)}
                aria-label={`Upgrade ${label(building.id)}`}
                level={level ?? 0}
                progress={progress?.building === building.id ? progress : null}
                art={building.art}
                locked={catalog?.requirements.some(
                  (r) => technologyLevel(requirementKey(r), props) < r.level,
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
    !buildingUnavailableReason(entry, body, building.id)
      ? {
          type:
            progress?.building === building.id
              ? progress.direction === 'down'
                ? 'Demolition'
                : 'Upgrade'
              : action,
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
