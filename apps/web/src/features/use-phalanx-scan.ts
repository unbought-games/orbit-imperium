import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { scanBlocker } from './phalanx-model'
export function usePhalanxScan(
  model: Coordinator,
  origin: string,
  position: components['schemas']['GalaxyPosition4'],
) {
  const state = useStore(model.store)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const source =
    state.view?.protocol === 4
      ? state.view.bodies.find((b) => b.id === origin)
      : undefined
  const attempt = [...state.attempts.values()].reverse().find((a) => {
    const c = a.envelope.command
    return (
      c.type === 'World' &&
      c.action.type === 'ScanPlanet' &&
      c.action.source_moon === origin &&
      c.action.target_planet === position.body?.id
    )
  })
  const pending = attempt && !['committed', 'rejected'].includes(attempt.status)
  const receipt = attempt?.receipt
  const report =
    receipt?.status === 'Committed' && 'result_ids' in receipt
      ? receipt.result_ids[0]
      : undefined
  const reason = scanBlocker(source, position, state.binding?.player)
  async function scan() {
    if (lock.current || pending || reason || !position.body) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (
        !(await model.send({
          type: 'World',
          action: {
            type: 'ScanPlanet',
            source_moon: origin,
            target_planet: position.body.id,
          },
        }))
      )
        setError(model.store.getState().message || 'Unable to submit scan.')
    } catch {
      setError('Unable to submit scan. Check your connection.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return {
    source,
    attempt,
    pending,
    receipt,
    report,
    reason,
    scan,
    busy,
    error,
  }
}
