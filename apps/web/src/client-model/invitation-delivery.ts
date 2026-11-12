import { HttpError } from '../adapters/http'
import {
  pendingInvitation,
  deferInvitation,
  clearRememberedInvitation,
} from './community-invitation'
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Optional attribution never participates in gameplay readiness. */
export class InvitationDelivery {
  private running = false
  private waitingForIdentity = false
  constructor(
    private storage: StoragePort,
    private apply: (
      request: { code: string; request_id: string },
      signal: AbortSignal,
    ) => Promise<unknown>,
    private newId: () => string,
    private now = Date.now,
  ) {}
  async attempt(account: string, signal: AbortSignal): Promise<void> {
    if (this.running || this.waitingForIdentity || signal.aborted) return
    this.running = true
    try {
      const pending = pendingInvitation(
        this.storage,
        account,
        this.newId,
        this.now(),
      )
      if (!pending || (pending.retry_at ?? 0) > this.now()) return
      // Throttle before dispatch so reload/another tab does not hammer an outage.
      deferInvitation(this.storage, pending, this.now() + 30_000, this.now())
      try {
        await this.apply(
          { code: pending.code, request_id: pending.request_id! },
          signal,
        )
        clearRememberedInvitation(this.storage, pending.code, this.now())
      } catch (error) {
        if (error instanceof HttpError && error.status === 401)
          this.waitingForIdentity = true
        if (
          !signal.aborted &&
          error instanceof HttpError &&
          error.status >= 400 &&
          error.status < 500 &&
          ![401, 408, 429].includes(error.status)
        )
          clearRememberedInvitation(this.storage, pending.code, this.now())
      }
    } catch {
      /* Storage or rewards failure must not block entry. */
    } finally {
      this.running = false
    }
  }
}
