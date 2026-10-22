import {
  Outlet,
  useMatches,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useGameSession } from './session-context'
import { ConstructionNotice } from '../ui/construction-notice'
import { ScreenContext } from './screen-context'
import { resolveNamedDestination } from './routes'
import { routeTarget } from './route-target'
import styles from './game-shell.module.css'
import { Heading, Text } from '../ui/typography'
import { Link } from '../ui/link'
import { Brand } from '../ui/brand'
import { StatePanel } from '../ui/state-panel'
import type { DispatchDraft } from '../features/missions'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ResourceStrip } from '../ui/resource-strip'
import { ActionStatus } from '../ui/action-status'
import { coordinates, label } from '../ui/format'
import { BodySelector } from './body-selector'
import { Navigation } from './navigation'
import { Popover } from '../ui/popover'
import { WifiOff } from 'lucide-react'
export function GameShell() {
  const { commands, view, model, logout, universeName } = useGameSession()
  // Transition snapshots are visible only while this exact identity owns the shell.
  const surfaceName = `game-${view.binding.account}-${view.binding.player}-${view.binding.universe}-${view.binding.epoch}`
  const navigate = useNavigate()
  const [dispatchDraft, setDispatchDraft] = useState<
    (DispatchDraft & { origin: string }) | null
  >(null)
  const location = useRouterState({ select: (state) => state.location })
  const matches = useMatches()
  const leaf = matches[matches.length - 1]
  const params = leaf.params as {
    universe?: string
    body?: string
    item?: string
  }
  const search = leaf.search as { body?: string }
  const route = resolveNamedDestination(
    {
      universe: params.universe,
      page: leaf.staticData.page ?? null,
      body: params.body ?? search.body,
      item: params.item,
    },
    view,
    universeName,
  )
  const body = view.bodies.find((b) => b.id === route.body)
  const { page, available } = route
  const heading = useRef<HTMLHeadingElement>(null)
  // Default context is recorded once; later view changes must not silently select another planet.
  useEffect(() => {
    if (
      available &&
      body &&
      !params.body &&
      (page === 'overview' || !search.body)
    ) {
      void navigate({
        ...routeTarget(universeName, page, body.id, route.item ?? undefined),
        replace: true,
      })
    }
  }, [
    available,
    body?.id,
    params.body,
    search.body,
    page,
    route.item,
    universeName,
    navigate,
  ])
  useLayoutEffect(() => {
    document.title = `${available ? (page === 'overview' ? 'Empire' : label(page)) : 'Unavailable'} · ${universeName} · Orbit Imperium`
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
    setDispatchDraft({ ...draft, origin: body.id })
    void model.recordPresence('BodyVisit', body.id)
    void navigate(routeTarget(universeName, 'dispatch', body.id))
  }
  function selectBody(id: string) {
    void model.recordPresence('BodyVisit', id)
    void navigate({
      ...routeTarget(universeName, available ? page : 'overview', id),
      viewTransition: true,
    })
  }
  const hasFeatureHeading =
    available &&
    (page === 'overview' ||
      page === 'settings' ||
      (view.protocol !== 2 &&
        ['resources', 'facilities', 'research', 'shipyard', 'defense'].includes(
          page,
        )) ||
      (view.protocol === 4 &&
        ['fleets', 'dispatch', 'galaxy', 'reports'].includes(page)))
  const title = !available
    ? 'Destination unavailable'
    : page === 'overview'
      ? `Empire — ${body?.kind ?? 'Planet'} ${body ? coordinates(body) : ''}`
      : page[0].toUpperCase() + page.slice(1)
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
    <div className={styles['game-shell']}>
      <style data-game-surface={surfaceName}>{`
        ::view-transition-group(${surfaceName}) { visibility: visible; }
        ::view-transition-old(${surfaceName}) { animation: surface-out var(--motion-enter) var(--ease-settle) both; }
        ::view-transition-new(${surfaceName}) { animation: surface-in var(--motion-enter) var(--ease-settle) both; }
      `}</style>
      <div className={styles['shell-columns']}>
        <div className={styles.header}>
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
            view={view}
            body={body?.id}
            page={page}
            onLogout={() => void logout()}
            onVisit={(p) =>
              void model.recordPresence(
                [
                  'overview',
                  'resources',
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
                className={styles.worldBar}
                role="group"
                aria-label="Planet and resources"
              >
                <div className={styles['mobile-context']}>
                  <BodySelector
                    bodies={view.bodies}
                    selected={body?.id}
                    onSelect={selectBody}
                  />
                </div>
                {navigation}
                <div className={styles.masthead}>
                  {body ? <ResourceStrip view={view} body={body} /> : <span />}
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
          <main
            id="main"
            tabIndex={-1}
            className={styles['work-area']}
            style={{ viewTransitionName: surfaceName }}
          >
            <div
              className={
                hasFeatureHeading ? styles.routeHeading : styles['page-heading']
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
                  dispatchDraft,
                  prepareDispatch,
                }}
              >
                <Outlet />
              </ScreenContext.Provider>
            )}
          </main>
        </div>
      </div>
      {page !== 'overview' && (
        <ConstructionNotice model={model} body={body?.id} />
      )}
    </div>
  )
}
