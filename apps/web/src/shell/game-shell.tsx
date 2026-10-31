import { ErrorBannerProvider, ErrorBannerSlot } from '../ui/error-banner'
import { useStore } from 'zustand'
import { occupiedFleetSlots } from '../client-model/game-projection'
import { FleetSlots } from '../features/fleet-slots'
import { ContentColumn } from '../ui/content-column'
import { CommandHud } from '../features/command-hud/command-hud'
import { dispatchSearch, validateDispatchSearch } from './dispatch-location'
import {
  Outlet,
  useMatches,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useGameSession } from './session-context'
import { ScreenContext } from './screen-context'
import {
  bodyPages,
  resolveDestination,
  resolveNamedDestination,
} from './routes'
import { validateGalaxySearch } from './galaxy-location'
import { routeTarget } from './route-target'
import { catalogSlug } from './catalog-routes'
import styles from './game-shell.module.css'
import { Heading, Text } from '../ui/typography'
import { Link } from '../ui/link'
import { ButtonLink } from '../ui/button'
import { Brand } from '../ui/brand'
import { StatePanel } from '../ui/state-panel'
import type { DispatchDraft } from '../features/missions'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { ResourceStrip } from '../ui/resource-strip'
import { bodyName, coordinates } from '../ui/format'
import { BodySelector } from './body-selector'
import { Navigation } from './navigation'
import { buildPages, pageTitles } from './navigation-model'
import { ArrowLeft } from 'lucide-react'
import { usePinnedHeader } from './use-pinned-header'
import { hasIncomingHostileFleet } from '../client-model/hostile-fleets'
import { developmentActivity, developmentBlockers } from './navigation-activity'
export function GameShell() {
  const { model } = useGameSession()
  return (
    <ErrorBannerProvider model={model}>
      <GameShellContent />
    </ErrorBannerProvider>
  )
}

function GameShellContent() {
  const pinned = usePinnedHeader()
  const { commands, view, model, logout, universeName } = useGameSession()
  const occupiedSlots = useStore(model.store, occupiedFleetSlots)
  const incomingHostile = hasIncomingHostileFleet(view)
  const navigate = useNavigate()
  const location = useRouterState({ select: (state) => state.location })
  const matches = useMatches()
  const leaf = matches[matches.length - 1]
  const params = leaf.params as {
    universe?: string
    body?: string
    item?: string
    coordinates?: string
  }
  const search = leaf.search as {
    body?: string
    alliance?: string
    player?: string
  }
  const route = resolveNamedDestination(
    {
      universe: params.universe,
      page: leaf.staticData.page ?? null,
      body:
        params.body ??
        search.body ??
        (bodyPages.includes(leaf.staticData.page!)
          ? view.bodies[0]?.id
          : undefined),
      item: params.item,
    },
    view,
    universeName,
  )
  const body = view.bodies.find((b) => b.id === route.body)
  const { page, available } = route
  const requestedBody = params.body ?? search.body
  const abandonment = useStore(model.store, (state) =>
    [...state.attempts.values()].some((attempt) => {
      const command = attempt.envelope.command
      return (
        attempt.status === 'committed' &&
        command.type === 'World' &&
        command.action.type === 'AbandonPlanet' &&
        command.action.body === requestedBody
      )
    }),
  )
  useEffect(() => {
    if (
      abandonment &&
      requestedBody &&
      !view.bodies.some((b) => b.id === requestedBody)
    ) {
      const home = view.protocol === 4 ? view.homeworld_id : undefined
      void navigate({
        ...routeTarget(universeName, 'overview', home ?? view.bodies[0]?.id),
        replace: true,
      })
    }
  }, [abandonment, requestedBody, view, navigate, universeName])
  const heading = useRef<HTMLHeadingElement>(null)
  const previousPathname = useRef(location.pathname)
  // Default context is recorded once; later view changes must not silently select another planet.
  useEffect(() => {
    if (
      available &&
      !params.coordinates &&
      body &&
      ((!params.body && bodyPages.includes(page)) ||
        (!params.body && !search.body) ||
        (!!params.body && !!search.body && bodyPages.includes(page)))
    ) {
      void navigate({
        ...routeTarget(universeName, page, body.id, route.item ?? undefined),
        ...(page === 'galaxy'
          ? { search: validateGalaxySearch(leaf.search) }
          : page === 'dispatch'
            ? { search: validateDispatchSearch(leaf.search) }
            : page === 'messages'
              ? { search: { body: body.id, player: search.player } }
              : page === 'alliance'
                ? { search: { body: body.id, alliance: search.alliance } }
                : {}),
        replace: true,
      })
    }
  }, [
    available,
    body?.id,
    params.body,
    params.coordinates,
    search.body,
    page,
    route.item,
    universeName,
    navigate,
  ])
  useLayoutEffect(() => {
    document.title = `${available ? pageTitles[page] : 'Unavailable'} · ${universeName} · Orbit Imperium`
    // Browsing systems is an in-place interaction: keep the input/arrow focused.
    const browsingGalaxy =
      page === 'galaxy' &&
      available &&
      previousPathname.current === location.pathname &&
      document.activeElement?.closest('[data-galaxy-navigation]')
    previousPathname.current = location.pathname
    if (browsingGalaxy) return
    heading.current?.focus()
    const frame = requestAnimationFrame(() => {
      // Scroll restoration can run after the commit. Never steal focus back
      // if the player has already moved into a control or opened the menu.
      if (document.activeElement === heading.current)
        heading.current?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.pathname, location.searchStr, available, page, universeName])
  function prepareDispatch(draft: DispatchDraft) {
    if (!body) return
    const origin =
      draft.origin && view.bodies.some((b) => b.id === draft.origin)
        ? draft.origin
        : body.id
    void model.recordPresence('BodyVisit', origin)
    void navigate({
      ...routeTarget(universeName, 'dispatch', origin),
      search: dispatchSearch(draft),
      state: {
        dispatchObservation: {
          ships: draft.ships,
          speed: draft.speed,
          target: draft.target,
          observedAt: draft.observedAt,
        },
      },
    })
  }
  function selectBody(id: string) {
    void model.recordPresence('BodyVisit', id)
    void navigate({
      ...routeTarget(
        universeName,
        available ? page : 'overview',
        id,
        available ? (route.item ?? undefined) : undefined,
      ),
      ...(available && page === 'messages'
        ? { search: { body: id, player: search.player } }
        : {}),
    })
  }
  const hideRouteHeading =
    available &&
    (page === 'overview' ||
      buildPages.includes(page) ||
      page === 'galaxy' ||
      page === 'fleets' ||
      page === 'settings' ||
      (view.protocol === 4 && page === 'reports'))
  const title = !available
    ? 'Destination unavailable'
    : page === 'overview'
      ? `Empire — ${body ? bodyName(body) : 'Planet'} ${body ? coordinates(body) : ''}`
      : pageTitles[page]
  return (
    <div
      className={styles['game-shell']}
      ref={pinned.shell}
      data-has-command-hud={view.protocol === 4 || undefined}
    >
      <div className={styles['shell-columns']}>
        <div className={styles.header} ref={pinned.header}>
          <header className={styles.identity} data-touch-control="">
            <Brand
              className={styles.brand}
              {...routeTarget(universeName, 'overview', body?.id)}
            />
            <span className={styles.universeName} aria-label="Current universe">
              {universeName}
            </span>
          </header>
          <Navigation
            activity={developmentActivity(model.store.getState(), body?.id)}
            blockers={developmentBlockers(model.store.getState(), body?.id)}
            view={view}
            body={body?.id}
            page={page}
            onLogout={() => void logout()}
            onVisit={(p) =>
              void model.recordPresence(
                [
                  'overview',
                  'resources',
                  'resource-settings',
                  'facilities',
                  'shipyard',
                  'defense',
                  'dispatch',
                ].includes(p)
                  ? 'BodyVisit'
                  : 'AccountVisit',
                [
                  'overview',
                  'resources',
                  'resource-settings',
                  'facilities',
                  'shipyard',
                  'defense',
                  'dispatch',
                ].includes(p)
                  ? (body?.id ?? null)
                  : null,
              )
            }
          >
            {(navigation) => (
              <div
                className={`${styles.worldBar} ${incomingHostile ? styles.hostile : ''}`}
                role="group"
                aria-label="Planet and resources"
              >
                <span className={styles.hostileStatus} role="status">
                  {incomingHostile
                    ? view.protocol === 4 &&
                      view.missiles?.some((f) => !f.outgoing)
                      ? 'Incoming missile attack. Interceptors defend automatically at impact.'
                      : 'Incoming hostile fleet: attack or espionage detected.'
                    : ''}
                </span>
                <div className={styles['mobile-context']}>
                  <BodySelector
                    bodies={view.bodies}
                    selected={body?.id}
                    onSelect={selectBody}
                  />
                </div>
                {navigation}
                <div className={styles.masthead}>
                  {body ? (
                    <ResourceStrip
                      view={view}
                      body={body}
                      renderStorageWarning={(building, warning) =>
                        resolveDestination(
                          {
                            universe: view.binding.universe,
                            page: 'resources',
                            body: body.id,
                            item: catalogSlug(building),
                          },
                          view,
                        ).available ? (
                          <Link
                            {...routeTarget(
                              universeName,
                              'resources',
                              body.id,
                              building,
                            )}
                          >
                            {warning}
                          </Link>
                        ) : (
                          warning
                        )
                      }
                      energyLink={
                        resolveDestination(
                          {
                            universe: view.binding.universe,
                            page: 'resource-settings',
                            body: body.id,
                          },
                          view,
                        ).available ? (
                          <Link
                            {...routeTarget(
                              universeName,
                              'resource-settings',
                              body.id,
                            )}
                            aria-label="Energy — resource settings"
                          />
                        ) : undefined
                      }
                    />
                  ) : (
                    <span />
                  )}
                </div>
              </div>
            )}
          </Navigation>
        </div>
        <div className={styles.center}>
          <ContentColumn
            as="main"
            width={page === 'dispatch' ? 'focused' : 'full'}
            id="main"
            tabIndex={-1}
            className={styles['work-area']}
          >
            <ErrorBannerSlot model={model} />
            <div
              className={
                hideRouteHeading ? styles.routeHeading : styles['page-heading']
              }
            >
              {page === 'dispatch' && (
                <ButtonLink
                  variant="secondary"
                  size="icon-small"
                  aria-label="Back to fleets"
                  title="Back to fleets"
                  {...routeTarget(universeName, 'fleets', body?.id)}
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </ButtonLink>
              )}
              <Heading level={1} tabIndex={-1} ref={heading}>
                {title}
              </Heading>
              {page === 'dispatch' && view.protocol === 4 && (
                <FleetSlots
                  className={styles.headerSlots}
                  used={occupiedSlots}
                  total={view.missions.fleet_slots}
                />
              )}
            </div>
            {!available ? (
              <StatePanel title="Choose an available destination">
                <Text>{route?.reason}</Text>
                <Link
                  {...routeTarget(universeName, 'overview', view.bodies[0]?.id)}
                >
                  Open your universe overview
                </Link>
              </StatePanel>
            ) : (
              <ScreenContext.Provider
                value={{
                  universeName,
                  commands,
                  view,
                  model,
                  logout,
                  route,
                  body,
                  prepareDispatch,
                }}
              >
                {page === 'fleets' && view.protocol !== 4 && (
                  <ButtonLink
                    {...routeTarget(universeName, 'dispatch', body?.id)}
                  >
                    Dispatch Fleet
                  </ButtonLink>
                )}
                <Outlet />
              </ScreenContext.Provider>
            )}
          </ContentColumn>
        </div>
      </div>
      <CommandHud body={body?.id} onDraft={prepareDispatch} />
    </div>
  )
}
