import {
  Orbit,
  Blocks,
  Radar,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
} from 'lucide-react'
import styles from './navigation.module.css'
import { Button } from '../ui/button'
import { BrandLogo, BrandWordmark } from '../ui/brand'
import { Link } from '../ui/link'
import { useEffect, useId, useRef } from 'react'
import type { BoundView } from '../client-model/commands'
import { routeTarget } from './route-target'
import { resolveDestination, type Page } from './routes'
import {
  buildPages,
  navigationAnchor,
  navigationGroups,
  pageTitles,
} from './navigation-model'

export function Navigation({
  view,
  body,
  page,
  onVisit,
  onLogout,
}: {
  view: BoundView
  body: string | undefined
  page: Page
  onVisit?: (page: Page) => void
  onLogout: () => void
}) {
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
      </>
    )
    return available ? (
      <Link
        preload="intent"
        viewTransition
        key={p}
        {...routeTarget(view.binding.universe, p, body)}
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
      <button key={p} disabled title="Not available in this universe">
        {contents}
      </button>
    )
  }
  return (
    <>
      <nav className={styles.primary} aria-label="Main navigation">
        {destination('overview', 'World', Orbit, true)}
        {destination('resources', 'Build', Blocks, true)}
        {destination('fleets', 'Fleet', Radar, true)}
        <button
          type="button"
          aria-label="Menu"
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
        </button>
      </nav>
      {selected === 'Build' && (
        <nav className={styles.secondary} aria-label="Build navigation">
          {buildPages.map((p) => destination(p))}
        </nav>
      )}
      {selected === 'Fleet' && (
        <nav className={styles.secondary} aria-label="Fleet navigation">
          {(['fleets', 'dispatch'] as Page[]).map((p) => destination(p))}
        </nav>
      )}
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
            variant="quiet"
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
        <Button
          variant="quiet"
          onClick={() => {
            opener.current = null
            close()
            onLogout()
          }}
        >
          <LogOut size={18} aria-hidden="true" /> Sign out
        </Button>
      </dialog>
    </>
  )
}
