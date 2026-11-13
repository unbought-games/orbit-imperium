import { SettingsNavigation } from './settings-navigation'
import { useOidcConfig } from '../client-model/use-oidc'
import { GameShellFrame } from './game-shell-frame'
import { ArrivalScene } from '../features/arrival/arrival-scene'
import { TutorialExperienceAction } from '../features/tutorial/experience-action'
import { TutorialSync } from '../features/tutorial/use-tutorial'
import { VacationNotice } from '../features/vacation'
import { EmpireDeletionNotice } from '../features/empire-deletion'
import { ErrorBannerProvider, ErrorBannerSlot } from '../ui/error-banner'
import { useStore } from 'zustand'
import { hasUnreadReports } from '../client-model/report-state'
import { ContentColumn } from '../ui/content-column'
import { CommandHud } from '../features/command-hud/command-hud'
import { dispatchSearch } from './dispatch-location'
import {
  Outlet,
  useMatches,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useGameSession } from './session-context'
import { ScreenContext } from './screen-context'
import { bodyPages, resolveNamedDestination } from './routes'
import { withoutBodySearch } from './page-search'
import { routeTarget } from './route-target'
import styles from './game-shell.module.css'
import { Heading, Text } from '../ui/typography'
import { Link } from '../ui/link'
import { ButtonLink } from '../ui/button'
import { StatePanel } from '../ui/state-panel'
import type { DispatchDraft } from '../features/missions'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { bodyName, coordinates } from '../ui/format'
import { buildPages, pageTitles } from './navigation-model'
import { ArrowLeft } from 'lucide-react'
import { developmentActivity, developmentBlockers } from './navigation-activity'
export function GameShell() {
  const { model, view } = useGameSession()
  if (view.protocol === 4 && view.arrival_pending) return <ArrivalScene />
  return (
    <ErrorBannerProvider model={model}>
      <GameShellContent />
    </ErrorBannerProvider>
  )
}

function GameShellContent() {
  const { state: accountConfig } = useOidcConfig()
  const { commands, view, model, logout, universeName } = useGameSession()
  const unreadReports = useStore(model.store, hasUnreadReports)
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
    welcome?: string
    invitation?: string
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
  const previousGalaxySite = useRef(location.search.site)
  const canonicalPage =
    page === 'alliance' && search.alliance ? 'alliance-discover' : page
  const canonicalizing =
    available &&
    !params.coordinates &&
    !!body &&
    (!params.body || search.body !== undefined || canonicalPage !== page)
  // Default context is recorded once; later view changes must not silently select another planet.
  useEffect(() => {
    if (canonicalizing && body) {
      void navigate({
        ...routeTarget(
          universeName,
          canonicalPage,
          body.id,
          route.item ?? undefined,
        ),
        search: withoutBodySearch(location.search),
        hash: location.hash,
        replace: true,
      })
    }
  }, [
    canonicalizing,
    canonicalPage,
    body?.id,
    location.search,
    location.hash,
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
      (document.activeElement?.closest('[data-galaxy-navigation]') ||
        location.search.site ||
        previousGalaxySite.current)
    const returningToReports =
      page === 'reports' &&
      /\/reports\/?$/.test(location.pathname) &&
      previousPathname.current?.startsWith(`${location.pathname}/`)
    previousPathname.current = location.pathname
    previousGalaxySite.current = location.search.site
    if (browsingGalaxy) return
    heading.current?.focus({ preventScroll: !!returningToReports })
    if (returningToReports) return
    const frame = requestAnimationFrame(() => {
      // Scroll restoration can run after the commit. Never steal focus back
      // if the player has already moved into a control or opened the menu.
      if (document.activeElement === heading.current)
        heading.current?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [
    location.pathname,
    location.searchStr,
    location.hash,
    available,
    page,
    universeName,
  ])
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
      ...(available
        ? {
            search: withoutBodySearch(location.search),
            hash: location.hash,
          }
        : {}),
    })
  }
  const hideRouteHeading =
    available &&
    (page === 'overview' ||
      buildPages.includes(page) ||
      page === 'galaxy' ||
      page === 'fleets' ||
      (page === 'dispatch' && view.protocol === 4) ||
      page === 'settings' ||
      page === 'rewards' ||
      page === 'menu' ||
      page === 'alliance' ||
      page === 'alliance-create' ||
      page === 'alliance-discover' ||
      (view.protocol === 4 && (page === 'reports' || page === 'messages')))
  const title = !available
    ? 'Destination unavailable'
    : page === 'overview'
      ? `Empire — ${body ? bodyName(body) : 'Planet'} ${body ? coordinates(body) : ''}`
      : pageTitles[page]
  return (
    <GameShellFrame
      accountUrl={
        accountConfig.status === 'ready'
          ? accountConfig.config.account_url
          : undefined
      }
      sidebar={
        page === 'settings' || page === 'rewards' ? (
          <SettingsNavigation universeName={universeName} body={body?.id} />
        ) : undefined
      }
      view={view}
      body={body}
      page={page}
      universeName={universeName}
      unreadReports={unreadReports}
      activity={developmentActivity(model.store.getState(), body?.id)}
      blockers={developmentBlockers(model.store.getState(), body?.id)}
      onSelectBody={selectBody}
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
      footer={<CommandHud body={body?.id} onDraft={prepareDispatch} />}
    >
      <TutorialSync />
      <ContentColumn
        as="main"
        width={
          page === 'briefing'
            ? 'reading'
            : page === 'dispatch'
              ? 'focused'
              : 'full'
        }
        id="main"
        tabIndex={-1}
        className={styles['work-area']}
      >
        <ErrorBannerSlot model={model} />
        {view.protocol === 4 && (
          <EmpireDeletionNotice
            deletion={view.empire_deletion}
            body={body?.id}
            universeName={universeName}
          />
        )}
        <div
          className={
            hideRouteHeading ? styles.routeHeading : styles['page-heading']
          }
        >
          {page === 'dispatch' && view.protocol !== 4 && (
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
          <TutorialExperienceAction page={page} />
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
              <ButtonLink {...routeTarget(universeName, 'dispatch', body?.id)}>
                Dispatch Fleet
              </ButtonLink>
            )}
            <VacationNotice
              vacation={view.protocol === 4 ? view.vacation : undefined}
              body={body?.id}
              universeName={universeName}
            />
            {/* Mount once at the canonical route, avoiding duplicate reads during redirects. */}
            {!canonicalizing && <Outlet />}
          </ScreenContext.Provider>
        )}
      </ContentColumn>
    </GameShellFrame>
  )
}
