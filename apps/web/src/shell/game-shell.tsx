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
import styles from './game-shell.module.css'
import { Heading, Text } from '../ui/typography'
import { Link } from '../ui/link'
import { Brand } from '../ui/brand'
import { StatePanel } from '../ui/state-panel'
import type { DispatchDraft } from '../features/missions'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { ResourceStrip } from '../ui/resource-strip'
import { ActionStatus } from '../ui/action-status'
import { bodyName, coordinates } from '../ui/format'
import { BodySelector } from './body-selector'
import { Navigation } from './navigation'
import { buildPages, fleetPages, pageTitles } from './navigation-model'
import { Popover } from '../ui/popover'
import { WifiOff } from 'lucide-react'
import { usePinnedHeader } from './use-pinned-header'
import { hasIncomingHostileFleet } from '../client-model/hostile-fleets'
import { developmentActivity } from './navigation-activity'
export function GameShell() {
  const pinned = usePinnedHeader()
  const { commands, view, model, logout, universeName } = useGameSession()
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
      fleetPages.includes(page) ||
      page === 'settings' ||
      (view.protocol === 4 && page === 'reports'))
  const title = !available
    ? 'Destination unavailable'
    : page === 'overview'
      ? `Empire — ${body ? bodyName(body) : 'Planet'} ${body ? coordinates(body) : ''}`
      : pageTitles[page]
  const freshness = model.stale && (
    <Popover
      label="Connection"
      className={styles.connection}
      trigger={
        <>
          <WifiOff size={14} />
          <span>Disconnected</span>
        </>
      }
    >
      <p>Connection interrupted — awaiting server confirmation.</p>
      <p>Confirmed {new Date(view.as_of_ms).toLocaleString()}</p>
    </Popover>
  )
  return (
    <div className={styles['game-shell']} ref={pinned.shell}>
      <div className={styles['shell-columns']}>
        <div className={styles.header} ref={pinned.header}>
          <header className={styles.identity}>
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
            view={view}
            body={body?.id}
            page={page}
            detail={view.protocol === 4 && !!route.item}
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
                    ? 'Incoming hostile fleet: attack or espionage detected.'
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
          <div className={styles.connectionSlot}>{freshness}</div>
        </div>
        <div className={styles.center}>
          {model.stale && (
            <p className={styles.stale} role="alert">
              Connection interrupted — awaiting server confirmation.
            </p>
          )}
          <main id="main" tabIndex={-1} className={styles['work-area']}>
            <div
              className={
                hideRouteHeading ? styles.routeHeading : styles['page-heading']
              }
            >
              <Heading level={1} tabIndex={-1} ref={heading}>
                {title}
              </Heading>
            </div>
            <ActionStatus model={model} selectedBody={body?.id} />
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
                <Outlet />
              </ScreenContext.Provider>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
