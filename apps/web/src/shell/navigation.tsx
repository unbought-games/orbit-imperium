import { useTutorial } from '../features/tutorial/use-tutorial'
import {
  briefingEntryAvailable,
  tutorialPages,
  tutorialMorePages,
} from '../features/tutorial/model'
import { Disclosure } from '../ui/disclosure'
import { useUniverseName } from './session-context'
import { PlayerName } from '../features/player-name'
import { Menu as AccountMenu } from '@base-ui/react/menu'
import {
  Orbit,
  Blocks,
  Radar,
  Telescope,
  Menu,
  Mail,
  LogOut,
  ChevronsUpDown,
  Settings,
  ArrowUpRight,
} from 'lucide-react'
import styles from './navigation.module.css'
import { Button } from '../ui/button'
import { Brand } from '../ui/brand'
import { Link } from '../ui/link'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FocusEvent,
} from 'react'
import type { BoundView } from '../client-model/commands'
import { routeTarget } from './route-target'
import { resolveDestination, type Page } from './routes'
import { pageIcons } from './navigation-icons'
import { buildPages, navigationAnchor, pageTitles } from './navigation-model'

function revealFocusedDestination(event: FocusEvent<HTMLElement>) {
  event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function Navigation({
  hasUnreadReports,
  view,
  body,
  page,
  activity,
  blockers,
  onVisit,
  onLogout,
  children,
}: {
  hasUnreadReports: boolean
  view: BoundView
  body: string | undefined
  page: Page
  activity: ReadonlySet<Page>
  blockers: ReadonlyMap<Page, string>
  onVisit?: (page: Page) => void
  onLogout: () => void
  children: (navigation: ReactNode) => ReactNode
}) {
  const universeName = useUniverseName()
  const { data: tutorial } = useTutorial()
  const visiblePages = tutorialPages(
    tutorial,
    view.protocol === 4 ? view : null,
  )
  const morePages = tutorialMorePages(visiblePages)
  const mobileMenu = useRef<HTMLAnchorElement>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeHiddenNavigation = () => {
      if (!desktop.matches) setAccountOpen(false)
    }
    desktop.addEventListener('change', closeHiddenNavigation)
    return () => desktop.removeEventListener('change', closeHiddenNavigation)
  }, [])
  const selected = morePages.includes(page) ? 'Menu' : navigationAnchor(page)
  const destination = (
    p: Page,
    title = pageTitles[p],
    Icon?: typeof Orbit,
    primary = false,
    inMore = false,
  ) => {
    if (p === 'briefing' && !briefingEntryAvailable(tutorial, view.protocol))
      return null
    if (!inMore && p !== 'menu' && visiblePages && !visiblePages.has(p))
      return null
    const working = !primary && activity.has(p)
    const blocked = !primary && !working ? blockers.get(p) : undefined
    const description = working ? 'Work in progress' : blocked
    const available = resolveDestination(
      { universe: view.binding.universe, page: p, body },
      view,
    ).available
    const contents = (
      <>
        {Icon && <Icon size={21} aria-hidden="true" />}
        <span>{title}</span>
        {description && (
          <span
            className={styles.activityBadge}
            data-blocked={blocked ? '' : undefined}
            aria-hidden="true"
          />
        )}
        {p === 'reports' && hasUnreadReports && (
          <span
            className={styles.unreadBadge}
            role="status"
            aria-label="Unread reports"
          >
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
        aria-description={description}
        title={description}
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
  const sidebarDestination = (p: Page) =>
    destination(p, pageTitles[p], pageIcons[p])
  const primaryNavigation = (
    <nav
      className={styles.primary}
      aria-label="Main navigation"
      data-touch-control=""
    >
      {destination('overview', 'Empire', Orbit, true)}
      {destination('resources', 'Develop', Blocks, true)}
      {destination('galaxy', 'Galaxy', Telescope, true)}
      {destination('fleets', 'Fleets', Radar, true)}
      <Link
        ref={mobileMenu}
        {...routeTarget(universeName, 'menu', body)}
        data-analytics="navigate_menu"
        aria-label="Menu"
        aria-description={hasUnreadReports ? 'Unread reports' : undefined}
        aria-current={selected === 'Menu' ? 'page' : undefined}
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
      </Link>
    </nav>
  )
  return (
    <>
      <aside className={styles.sidebar} aria-label="Game navigation">
        <div className={styles.sidebarIdentity}>
          <Brand
            className={styles.sidebarBrand}
            {...routeTarget(universeName, 'overview', body)}
          />
        </div>
        <nav
          className={styles.sidebarDestinations}
          aria-label="Main navigation"
          data-touch-control=""
        >
          {destination('overview', 'Empire', Orbit, true)}
          {sidebarDestination('briefing')}
          {destination('resources', 'Develop', Blocks, true)}
          <nav
            className={styles.sidebarDevelop}
            aria-label="Develop navigation"
          >
            {buildPages.map(sidebarDestination)}
          </nav>
          {destination('galaxy', 'Galaxy', Telescope, true)}
          {destination('fleets', 'Fleets', Radar, true)}
          {sidebarDestination('reports')}
          {sidebarDestination('combat-simulator')}
          {(!visiblePages ||
            ['alliance', 'messages', 'high-scores'].some((p) =>
              visiblePages.has(p as Page),
            )) && <h2 className={styles.sidebarLabel}>Community</h2>}
          {sidebarDestination('alliance')}
          {sidebarDestination('messages')}
          {sidebarDestination('high-scores')}
          {morePages.length > 0 && (
            <Disclosure
              className={styles.more}
              summary="More"
              open={morePages.includes(page) || undefined}
            >
              <nav
                aria-label="More navigation"
                className={styles.moreDestinations}
              >
                {morePages.map((p) =>
                  destination(
                    p,
                    pageTitles[p],
                    pageIcons[p] ?? ArrowUpRight,
                    false,
                    true,
                  ),
                )}
              </nav>
            </Disclosure>
          )}
        </nav>
        <div className={styles.sidebarAccount}>
          <AccountMenu.Root open={accountOpen} onOpenChange={setAccountOpen}>
            <AccountMenu.Trigger
              render={
                <Button variant="ghost" className={styles.sidebarPlayer} />
              }
              aria-label="Account menu"
            >
              <span className={styles.username} aria-label="Username">
                <PlayerName
                  player={view.binding.player}
                  fallback="Commander"
                  interactive={false}
                  linkAlliance={false}
                />
              </span>
              <ChevronsUpDown size={16} aria-hidden="true" />
            </AccountMenu.Trigger>
            <AccountMenu.Portal>
              <AccountMenu.Positioner
                positionMethod="fixed"
                side="top"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                className={styles.accountPositioner}
              >
                <AccountMenu.Popup
                  className={styles.accountMenu}
                  aria-label="Account menu"
                  finalFocus={() =>
                    window.matchMedia('(min-width: 1024px)').matches
                      ? true
                      : mobileMenu.current
                  }
                >
                  <AccountMenu.LinkItem
                    closeOnClick
                    render={<a href="/profile" />}
                    className={styles.accountMenuItem}
                  >
                    My Orbit profile
                  </AccountMenu.LinkItem>
                  <AccountMenu.LinkItem
                    closeOnClick
                    render={
                      <Link {...routeTarget(universeName, 'settings', body)} />
                    }
                    className={styles.accountMenuItem}
                    data-analytics="navigate_settings"
                    onClick={(event) => {
                      if (
                        event.button === 0 &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey
                      )
                        onVisit?.('settings')
                    }}
                  >
                    <Settings size={16} aria-hidden="true" /> Settings
                  </AccountMenu.LinkItem>
                  <AccountMenu.Item
                    className={styles.accountMenuItem}
                    onClick={onLogout}
                  >
                    <LogOut size={16} aria-hidden="true" /> Logout
                  </AccountMenu.Item>
                </AccountMenu.Popup>
              </AccountMenu.Positioner>
            </AccountMenu.Portal>
          </AccountMenu.Root>
        </div>
      </aside>
      <div className={styles.topBar} data-sticky-navigation>
        {children(primaryNavigation)}
        {selected === 'Develop' && (
          <nav
            className={styles.secondary}
            aria-label="Develop navigation"
            data-touch-control=""
            onFocus={revealFocusedDestination}
          >
            {buildPages.map((p) => destination(p))}
          </nav>
        )}
      </div>
    </>
  )
}
