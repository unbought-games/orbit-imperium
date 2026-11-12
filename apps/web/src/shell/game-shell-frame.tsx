import type { ReactNode } from 'react'
import type { BoundView } from '../client-model/commands'
import { hasIncomingHostileFleet } from '../client-model/hostile-fleets'
import { ResourceStrip } from '../ui/resource-strip'
import { Brand } from '../ui/brand'
import { Link } from '../ui/link'
import { BodySelector } from './body-selector'
import { Navigation } from './navigation'
import { resolveDestination, type Page } from './routes'
import { routeTarget } from './route-target'
import { catalogSlug } from './catalog-routes'
import { usePinnedHeader } from './use-pinned-header'
import styles from './game-shell.module.css'

/** Persistent shell presentation, composed independently of route loading and session effects. */
export function GameShellFrame({
  view,
  body,
  page,
  universeName,
  unreadReports,
  activity,
  blockers,
  onSelectBody,
  onVisit,
  onLogout,
  children,
  footer,
}: {
  view: BoundView
  body?: BoundView['bodies'][number]
  page: Page
  universeName: string
  unreadReports: boolean
  activity: ReadonlySet<Page>
  blockers: ReadonlyMap<Page, string>
  onSelectBody: (id: string) => void
  onVisit?: (page: Page) => void
  onLogout: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const pinned = usePinnedHeader()
  const incomingHostile = hasIncomingHostileFleet(view)
  const hostileMessage = incomingHostile
    ? view.protocol === 4 && view.missiles?.some((f) => !f.outgoing)
      ? 'Incoming missile attack. Interceptors defend automatically at impact.'
      : 'Incoming hostile fleet: attack or espionage detected.'
    : ''
  const allianceArea = page.startsWith('alliance')
  return (
    <div
      className={styles['game-shell']}
      ref={pinned.shell}
      data-has-command-hud={view.protocol === 4 || undefined}
    >
      <div className={styles['shell-columns']} ref={pinned.columns}>
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
            hasUnreadReports={unreadReports}
            activity={activity}
            blockers={blockers}
            view={view}
            body={body?.id}
            page={page}
            onLogout={onLogout}
            onVisit={onVisit}
          >
            {(navigation) =>
              allianceArea ? (
                navigation
              ) : (
                <div
                  className={`${styles.worldBar} ${incomingHostile ? styles.hostile : ''}`}
                  role="group"
                  aria-label="Planet and resources"
                >
                  <span className={styles.hostileStatus} role="status">
                    {hostileMessage}
                  </span>
                  <div className={styles['mobile-context']}>
                    <BodySelector
                      bodies={view.bodies}
                      selected={body?.id}
                      onSelect={onSelectBody}
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
              )
            }
          </Navigation>
        </div>
        <div className={styles.center}>
          {allianceArea && incomingHostile && (
            <div className={styles.allianceThreat} role="status">
              <span>{hostileMessage}</span>
              {body && (
                <Link {...routeTarget(universeName, 'fleets', body.id)}>
                  View fleets
                </Link>
              )}
            </div>
          )}
          {children}
        </div>
      </div>
      {footer}
    </div>
  )
}
