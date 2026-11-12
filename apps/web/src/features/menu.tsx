import { useRewardsVisible } from '../shell/community-rewards-context'
import { useTutorial } from './tutorial/use-tutorial'
import {
  briefingEntryAvailable,
  tutorialPages,
  tutorialMorePages,
} from './tutorial/model'
import { Disclosure } from '../ui/disclosure'
import { ChevronRight, LogOut } from 'lucide-react'
import { useStore } from 'zustand'
import {
  hasUnreadReports,
  unreadReportCount,
} from '../client-model/report-state'
import { pageIcons } from '../shell/navigation-icons'
import { navigationGroups, pageTitles } from '../shell/navigation-model'
import { routeTarget } from '../shell/route-target'
import { resolveDestination, type Page } from '../shell/routes'
import { useGameScreen } from '../shell/screen-context'
import { Button, ButtonLink } from '../ui/button'
import { PlayerName } from './player-name'
import styles from './menu.module.css'

export function MenuScreen() {
  const { universeName, view, body, model, logout } = useGameScreen()
  const rewardsVisible = useRewardsVisible()
  const { data: tutorial } = useTutorial()
  const visible = tutorialPages(tutorial, view.protocol === 4 ? view : null)
  const more = tutorialMorePages(visible)
  const groups: { title: string; pages: Page[] }[] = [
    ...navigationGroups.map((group) => ({
      ...group,
      pages: group.pages.filter(
        (p) =>
          (!visible || visible.has(p)) &&
          (p !== 'briefing' || briefingEntryAvailable(tutorial, view.protocol)),
      ),
    })),
    ...(more.length ? [{ title: 'More', pages: more }] : []),
    {
      title: 'Account',
      pages: [...(rewardsVisible ? ['rewards' as const] : []), 'settings'],
    },
  ]
  const unread = useStore(model.store, hasUnreadReports)
  const count = useStore(model.store, unreadReportCount)
  const available = (page: Page) =>
    resolveDestination(
      { universe: view.binding.universe, page, body: body?.id },
      view,
    ).available
  return (
    <div className={styles.page}>
      <nav aria-label="Menu destinations" className={styles.groups}>
        {groups.map(({ title, pages }) => {
          const destinations = pages.filter(available)
          const links = destinations.map((page) => {
            const Icon = pageIcons[page] ?? ChevronRight
            return (
              <ButtonLink
                key={page}
                variant="ghost"
                className={styles.row}
                {...routeTarget(universeName, page, body?.id)}
                aria-label={
                  page === 'reports' && unread
                    ? 'Reports — unread reports'
                    : undefined
                }
                data-analytics={`navigate_${page}`}
                onClick={(event) => {
                  if (
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey
                  )
                    void model.recordPresence('AccountVisit', null)
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <span className={styles.rowLabel}>{pageTitles[page]}</span>
                {page === 'reports' && unread && (
                  <span
                    className={styles.unread}
                    aria-label={
                      count
                        ? `${count === 99 ? '99 or more' : count} unread reports`
                        : 'Unread reports'
                    }
                    role="status"
                  >
                    {count ? (count === 99 ? '99+' : count) : null}
                  </span>
                )}
                <ChevronRight size={16} aria-hidden="true" />
              </ButtonLink>
            )
          })
          return (
            destinations.length > 0 && (
              <section key={title} aria-label={title}>
                {title === 'More' ? (
                  <Disclosure summary="More">
                    <nav aria-label="More navigation">{links}</nav>
                  </Disclosure>
                ) : (
                  <>
                    <h2>{title}</h2>
                    {links}
                  </>
                )}
              </section>
            )
          )
        })}
      </nav>
      <footer className={styles.account}>
        <span aria-label="Username" className={styles.username}>
          <PlayerName player={view.binding.player} fallback="Commander" />
        </span>
        <Button
          variant="ghost"
          className={styles.logout}
          onClick={() => void logout()}
        >
          <LogOut size={16} aria-hidden="true" /> Log out
        </Button>
      </footer>
    </div>
  )
}
