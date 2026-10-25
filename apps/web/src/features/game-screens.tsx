import { useSearch, useRouterState } from '@tanstack/react-router'
import { draftFromSearch } from '../shell/dispatch-location'
import {
  useCatalogSelection,
  type CatalogSelection,
} from '../shell/use-catalog-selection'
import { Galaxy } from './galaxy'
import { Dispatch, MissionFleets } from './missions'
import { Reports } from './reports'
import { bindingKey } from '../client-model/commands'
import { useGameScreen } from '../shell/screen-context'
import { EmpireOverview } from './empire-overview'
import { Progression } from './progression'
import { Production } from './progression/production'
import { Operations } from './operations'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { label } from '../ui/format'

export function OverviewScreen() {
  const { view, body, model } = useGameScreen()
  return body ? (
    <>
      <EmpireOverview
        key={bindingKey(view.binding)}
        view={view}
        body={body}
        model={model}
      />
      {view.protocol === 2 && <OperationsScreen />}
    </>
  ) : null
}
export function EconomyScreen() {
  const { view, body, route, model } = useGameScreen()
  const selection = useCatalogSelection()
  if (!body) return null
  if (view.protocol === 2) return <OperationsScreen selection={selection} />
  return (
    <>
      <Progression
        key={`${bindingKey(view.binding)}:${body.id}:${route.page}`}
        selection={selection}
        coordinator={model}
        view={view}
        body={view.bodies.find((b) => b.id === body.id)!}
        page={route.page}
      />
    </>
  )
}
export function ResourceSettingsScreen() {
  const { view, body, model } = useGameScreen()
  if (!body || view.protocol === 2) return null
  const planet = view.bodies.find((candidate) => candidate.id === body.id)
  if (
    !planet ||
    !view.progression.production.some((entry) => entry.body === planet.id)
  )
    return null
  return (
    <Production
      key={`${bindingKey(view.binding)}:${planet.id}`}
      coordinator={model}
      view={view}
      body={planet}
    />
  )
}
export function OperationsScreen({
  selection,
}: { selection?: CatalogSelection } = {}) {
  const { view, body, route, commands, model, prepareDispatch, universeName } =
    useGameScreen()
  const search = useSearch({ strict: false })
  const urlDraft = draftFromSearch(search)
  const observation = useRouterState({
    select: (state) => state.location.state.dispatchObservation,
  })
  const prepared = urlDraft ? { ...urlDraft, ...observation } : null
  const settings = model.settings
  if (!body) return null
  if (view.protocol === 4) {
    if (route.page === 'galaxy')
      return (
        <Galaxy
          model={model}
          universe={universeName}
          origin={body.id}
          onDraft={(coordinates, mission) =>
            prepareDispatch({ coordinates, mission })
          }
        />
      )
    if (route.page === 'dispatch')
      return (
        <Dispatch
          key={`${body.id}:${JSON.stringify(search)}`}
          model={model}
          view={view}
          body={view.bodies.find((b) => b.id === body.id)!}
          draft={prepared}
        />
      )
    if (route.page === 'fleets')
      return (
        <MissionFleets
          model={model}
          view={view}
          origin={body.id}
          item={route.item}
        />
      )
    if (route.page === 'reports')
      return (
        <Reports
          model={model}
          universe={universeName}
          origin={body.id}
          item={route.item}
          onDraft={prepareDispatch}
        />
      )
    return null
  }
  if (view.protocol !== 2) return null
  return (
    <>
      <Text aria-label="Universe settings">
        {settings
          ? `Universe speed: ${settings.speed}× — fixed for this universe. ${settings.galaxies} galaxy · ${settings.systems_per_galaxy} solar systems per galaxy · ${settings.positions_per_system} planet positions per system.`
          : ''}
      </Text>
      {route.page === 'overview' && (
        <Section aria-label="Completed research">
          <Heading level={2}>Completed research</Heading>
          {view.research.length ? (
            view.research.map((research) => (
              <Text key={research.research}>
                {label(research.research)} · Level {research.level}
              </Text>
            ))
          ) : (
            <Text>No research levels are available.</Text>
          )}
        </Section>
      )}
      <Text>Research actions: unavailable in this universe.</Text>
      <Text>Manufacturing actions: unavailable in this universe.</Text>
      <Operations
        key={`${bindingKey(view.binding)}:${body.id}:${route.page}:${route.item ?? ''}`}
        view={view}
        body={view.bodies.find((b) => b.id === body.id)!}
        commands={commands}
        selection={selection}
        page={route.page}
        item={route.item}
      />
    </>
  )
}
export { SettingsScreen } from './settings'
