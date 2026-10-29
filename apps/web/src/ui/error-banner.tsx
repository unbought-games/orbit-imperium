import { createContext, useContext, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import type { Coordinator } from '../client-model/coordinator'
import { ActionStatus } from './action-status'
import styles from './error-banner.module.css'

// Features keep their own interaction errors; only their rendered notice moves.
export const ErrorBannerTarget = createContext<
  HTMLDivElement | null | undefined
>(undefined)

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
  surface = 'page',
}: {
  model: Coordinator
  portalRef?: Ref<HTMLDivElement>
  surface?: 'page' | 'dialog'
}) {
  return (
    <div
      className={styles.banner}
      data-testid="game-error-banner"
      data-error-surface={surface}
    >
      <ActionStatus model={model} />
      <div className={styles.portal} ref={portalRef} />
    </div>
  )
}
