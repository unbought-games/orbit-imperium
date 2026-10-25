import { useUniverseName } from './session-context'
import { PlayerName } from '../features/player-name'
import {
  Orbit,
  Blocks,
  Radar,
  Menu,
  Mail,
  X,
  LogOut,
  ArrowUpRight,
} from 'lucide-react'
import styles from './navigation.module.css'
import { Button } from '../ui/button'
import { BrandLogo, BrandWordmark } from '../ui/brand'
import { Link } from '../ui/link'
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type FocusEvent,
} from 'react'
import type { BoundView } from '../client-model/commands'
import { routeTarget } from './route-target'
import { resolveDestination, type Page } from './routes'
import {
  buildPages,
  fleetPages,
  navigationAnchor,
  navigationGroups,
  pageTitles,
} from './navigation-model'

function revealFocusedDestination(event: FocusEvent<HTMLElement>) {
  event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function Navigation({
  view,
  body,
  page,
  detail = false,
  onVisit,
  onLogout,
  children,
}: {
  view: BoundView
  body: string | undefined
  page: Page
  detail?: boolean
  onVisit?: (page: Page) => void
  onLogout: () => void
  children: (navigation: ReactNode) => ReactNode
}) {
  const universeName = useUniverseName()
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const menuId = useId()
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (!desktop.matches || !dialog.current?.open) return
      dialog.current.close()
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])
  const close = () => dialog.current?.close()
  const selected = navigationAnchor(page)
  const hasUnreadReports =
    view.protocol === 4 && view.has_unread_reports === true
  const destination = (
    p: Page,
    title = pageTitles[p],
    Icon?: typeof Orbit,
    primary = false,
  ) => {
    const available = resolveDestination(
      { universe: view.binding.universe, page: p, body },
      view,
    ).available
    const contents = (
      <>
        {Icon && <Icon size={21} aria-hidden="true" />}
        <span>{title}</span>
        {p === 'reports' && hasUnreadReports && (
          <span className={styles.unreadBadge} aria-label="Unread reports">
            <Mail size={16} aria-hidden="true" />
          </span>
        )}
      </>
    )
    return available ? (
      <Link
        className={
          p === 'reports' && hasUnreadReports ? styles.unread : undefined
        }
        aria-label={
          p === 'reports' && hasUnreadReports
            ? 'Reports — unread reports'
            : undefined
        }
        preload="intent"
        data-analytics={`navigate_${p}`}
        key={p}
        {...routeTarget(universeName, p, body)}
        aria-current={
          (primary ? title === selected : p === page) ? 'page' : undefined
        }
        onClick={(event) => {
          if (
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            onVisit?.(p)
            opener.current = null
            close()
          }
        }}
      >
        {contents}
      </Link>
    ) : (
      <Button
        variant="ghost"
        key={p}
        disabled
        title="Not available in this universe"
      >
        {contents}
      </Button>
    )
  }
  const fleetLanding = resolveDestination(
    { universe: view.binding.universe, page: 'galaxy', body },
    view,
  ).available
    ? 'galaxy'
    : 'fleets'
  const primaryNavigation = (
    <nav className={styles.primary} aria-label="Main navigation">
      {destination('overview', 'Empire', Orbit, true)}
      {destination('resources', 'Develop', Blocks, true)}
      {destination(fleetLanding, 'Fleet', Radar, true)}
      <Button
        variant="ghost"
        type="button"
        aria-label="Menu"
        aria-description={hasUnreadReports ? 'Unread reports' : undefined}
        aria-haspopup="dialog"
        aria-controls={menuId}
        aria-current={selected === 'Menu' ? 'page' : undefined}
        onClick={(event) => {
          opener.current = event.currentTarget
          dialog.current?.showModal()
        }}
      >
        <Menu size={21} aria-hidden="true" />
        <span>Menu</span>
        {hasUnreadReports && (
          <span
            className={styles.menuAlert}
            role="status"
            aria-label="Unread reports"
          >
            <Mail size={16} aria-hidden="true" />
            <span className={styles.srOnly}>Unread reports</span>
          </span>
        )}
      </Button>
    </nav>
  )
  return (
    <>
      <div className={styles.topBar} data-sticky-navigation>
        {children(primaryNavigation)}
        {selected === 'Develop' && (
          <nav
            className={styles.secondary}
            aria-label="Develop navigation"
            onFocus={revealFocusedDestination}
          >
            {buildPages.map((p) => destination(p))}
          </nav>
        )}
        {selected === 'Fleet' && !detail && (
          <nav
            className={styles.secondary}
            aria-label="Fleet navigation"
            onFocus={revealFocusedDestination}
          >
            {fleetPages.map((p) => destination(p))}
          </nav>
        )}
      </div>
      <dialog
        id={menuId}
        className={styles.dialog}
        ref={dialog}
        aria-labelledby={`${menuId}-title`}
        onClose={() => opener.current?.focus()}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          if (
            event.target === event.currentTarget &&
            (event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom)
          )
            close()
        }}
      >
        <div className={styles.heading}>
          <div className={styles.brand}>
            <BrandLogo alt="" />
            <BrandWordmark />
          </div>
          <Button
            autoFocus
            aria-label="Close menu"
            variant="secondary"
            size="icon"
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </div>
        <h2 id={`${menuId}-title`}>Navigation</h2>
        <nav className={styles.groups} aria-label="Menu destinations">
          {navigationGroups.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {group.pages.map((p) =>
                destination(p, pageTitles[p], ArrowUpRight),
              )}
            </section>
          ))}
        </nav>
        <div className={styles.account}>
          <span className={styles.username} aria-label="Username">
            <PlayerName player={view.binding.player} fallback="You" />
          </span>
          <Button
            variant="secondary"
            onClick={() => {
              opener.current = null
              close()
              onLogout()
            }}
          >
            <LogOut size={18} aria-hidden="true" /> Sign out
          </Button>
        </div>
      </dialog>
    </>
  )
}
