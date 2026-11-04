import {
  ChevronRight,
  LogOut,
  Mail,
  MessageCircle,
  Settings,
  Shield,
  Swords,
  Trophy,
} from 'lucide-react'
import { useStore } from 'zustand'
import { hasUnreadReports } from '../client-model/report-state'
import { navigationGroups, pageTitles } from '../shell/navigation-model'
import { routeTarget } from '../shell/route-target'
import { resolveDestination, type Page } from '../shell/routes'
import { useGameScreen } from '../shell/screen-context'
import { Button, ButtonLink } from '../ui/button'
import { PlayerName } from './player-name'
import styles from './menu.module.css'

const icons = {
  messages: MessageCircle,
  alliance: Shield,
  'high-scores': Trophy,
  reports: Mail,
  'combat-simulator': Swords,
  settings: Settings,
}

export function MenuScreen() {
  const { universeName, view, body, model, logout } = useGameScreen()
  const unread = useStore(model.store, hasUnreadReports)
  const available = (page: Page) =>
    resolveDestination(
      { universe: view.binding.universe, page, body: body?.id },
      view,
    ).available
  return (
    <div className={styles.page}>
      <nav aria-label="Menu destinations" className={styles.groups}>
        {navigationGroups.map(({ title, pages }) => {
          const destinations = pages.filter(available)
          return (
            destinations.length > 0 && (
              <section key={title} aria-label={title}>
                <h2>{title}</h2>
                {destinations.map((page) => {
                  const Icon = icons[page]
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
                      <span>{pageTitles[page]}</span>
                      {page === 'reports' && unread && (
                        <span
                          className={styles.unread}
                          aria-label="Unread reports"
                          role="status"
                        >
                          Unread
                        </span>
                      )}
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className={styles.chevron}
                      />
                    </ButtonLink>
                  )
                })}
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
