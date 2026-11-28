import { ShieldAlert, ArrowRight, Radar } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BoundView } from '../client-model/commands'
import { incomingThreatKind } from '../client-model/hostile-fleets'
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

const threatMessages = {
  attack: 'Incoming attack',
  espionage: 'Incoming espionage fleet',
  missile:
    'Incoming missile attack. Interceptors defend automatically at impact.',
}

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
  accountUrl,
  children,
  footer,
  sidebar,
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
  accountUrl?: string | null
  children: ReactNode
  footer?: ReactNode
  sidebar?: ReactNode
}) {
  const pinned = usePinnedHeader()
  const threat = incomingThreatKind(view)
  const allianceArea = page.startsWith('alliance')
  const showWarning = threat && (threat !== 'espionage' || allianceArea)
  const ThreatIcon = threat === 'espionage' ? Radar : ShieldAlert
  const warning = (
    <div
      className={showWarning ? styles.threatBar : styles.hostileStatus}
      data-threat={threat ?? undefined}
      role="status"
    >
      {threat && (
        <>
          {showWarning && <ThreatIcon size={20} aria-hidden="true" />}
          <strong>{threatMessages[threat]}</strong>
          {showWarning && body && (
            <Link
              {...routeTarget(universeName, 'overview', body.id)}
              hash="fleet-movements"
            >
              View movements <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        </>
      )}
    </div>
  )
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
            sidebar={sidebar}
            hasUnreadReports={unreadReports}
            activity={activity}
            blockers={blockers}
            view={view}
            body={body?.id}
            page={page}
            onLogout={onLogout}
            accountUrl={accountUrl}
            onVisit={onVisit}
          >
            {(navigation) =>
              allianceArea ? (
                <>
                  {navigation}
                  {warning}
                </>
              ) : (
                <div
                  className={`${styles.worldBar} ${threat ? styles.hostile : ''}`}
                  role="group"
                  aria-label="Planet and resources"
                >
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
                  {warning}
                </div>
              )
            }
          </Navigation>
        </div>
        <div className={styles.center}>{children}</div>
      </div>
      {footer}
    </div>
  )
}
