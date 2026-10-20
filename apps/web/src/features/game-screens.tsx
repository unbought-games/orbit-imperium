import { Galaxy } from './galaxy'
import { Dispatch, MissionFleets } from './missions'
import { Reports } from './reports'
import { bindingKey } from '../client-model/commands'
import { useGameScreen } from '../shell/screen-context'
import { PlanetOverview } from './planet-overview'
import { Progression } from './progression'
import { Operations } from './operations'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { label } from '../ui/format'

export function OverviewScreen() {
  const { view, body } = useGameScreen()
  return body ? (
    <>
      <PlanetOverview view={view} body={body} />
      {view.protocol === 2 && <OperationsScreen />}
    </>
  ) : null
}
export function EconomyScreen() {
  const { view, body, route, model } = useGameScreen()
  if (!body) return null
  if (view.protocol === 2) return <OperationsScreen />
  return (
    <>
      <Progression
        key={`${bindingKey(view.binding)}:${body.id}:${route.page}`}
        coordinator={model}
        view={view}
        body={view.bodies.find((b) => b.id === body.id)!}
        page={route.page}
      />
    </>
  )
}
export function OperationsScreen() {
  const { view, body, route, commands, model, dispatchDraft, prepareDispatch } =
    useGameScreen()
  const settings = model.settings
  if (!body) return null
  if (view.protocol === 4) {
    if (route.page === 'galaxy')
      return (
        <Galaxy
          model={model}
          universe={view.binding.universe}
          origin={body.id}
          onDraft={(coordinates, mission) =>
            prepareDispatch({ coordinates, mission })
          }
        />
      )
    if (route.page === 'dispatch')
      return (
        <Dispatch
          key={body.id}
          model={model}
          view={view}
          body={view.bodies.find((b) => b.id === body.id)!}
          draft={dispatchDraft?.origin === body.id ? dispatchDraft : null}
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
          universe={view.binding.universe}
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
        page={route.page}
        item={route.item}
      />
    </>
  )
}
export { SettingsScreen } from './settings'
