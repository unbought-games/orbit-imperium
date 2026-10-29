import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import type { Coordinator } from '../client-model/coordinator'
import { ActionStatus } from './action-status'
import styles from './error-banner.module.css'

type Surface = 'page' | 'dialog'
type Slots = Record<Surface, (node: HTMLDivElement | null) => void>
const ErrorBannerSlots = createContext<Slots | null>(null)
const ErrorBannerTarget = createContext<HTMLDivElement | null | undefined>(
  undefined,
)

/** One banner and one announcement history, moved between the page and its modal. */
export function ErrorBannerProvider({
  model,
  children,
}: {
  model: Coordinator
  children: ReactNode
}) {
  const [page, setPage] = useState<HTMLDivElement | null>(null)
  const [dialog, setDialog] = useState<HTMLDivElement | null>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [messages, setMessages] = useState<HTMLDivElement | null>(null)
  const slots = useMemo(() => ({ page: setPage, dialog: setDialog }), [])
  useLayoutEffect(() => {
    const node = document.createElement('div')
    setHost(node)
    return () => node.remove()
  }, [])
  useLayoutEffect(() => {
    const target = dialog ?? page
    // Keep the portal container itself stable: changing createPortal's target
    // would remount notices and replay announcements on each HUD open/close.
    if (host && target && host.parentElement !== target)
      target.appendChild(host)
  }, [host, page, dialog])
  return (
    <ErrorBannerSlots.Provider value={slots}>
      <ErrorBannerTarget.Provider value={messages}>
        {children}
        {host &&
          createPortal(
            <ErrorBanner model={model} portalRef={setMessages} />,
            host,
          )}
      </ErrorBannerTarget.Provider>
    </ErrorBannerSlots.Provider>
  )
}

export function ErrorBannerSlot({
  model,
  surface = 'page',
}: {
  model: Coordinator
  surface?: Surface
}) {
  const slots = useContext(ErrorBannerSlots)
  return slots ? <div ref={slots[surface]} /> : <ErrorBanner model={model} />
}

// Features keep their own interaction errors; only their rendered notice moves.
export function ErrorBannerMessage({ children }: { children: ReactNode }) {
  const target = useContext(ErrorBannerTarget)
  const entry = <div data-error-entry="">{children}</div>
  // Standalone previews still expose their errors without requiring the shell.
  return target === undefined
    ? entry
    : target
      ? createPortal(entry, target)
      : null
}

export function ErrorBanner({
  model,
  portalRef,
}: {
  model: Coordinator
  portalRef?: Ref<HTMLDivElement>
}) {
  return (
    <div className={styles.banner} data-testid="game-error-banner">
      <ActionStatus model={model} />
      <div className={styles.portal} ref={portalRef} />
    </div>
  )
}
