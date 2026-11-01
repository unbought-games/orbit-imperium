import type { SimulationAlly } from './simulation-allies'
import { useEffect, useRef, useState } from 'react'
import type { Coordinator } from '../client-model/coordinator'
import type {
  SimulationInputs,
  SimulationResponse,
} from './combat-simulation-model'
type RunState =
  | { scope: string; status: 'running' }
  | { scope: string; status: 'done'; response: SimulationResponse }
  | { scope: string; status: 'error'; message: string }
export function useCombatSimulation(model: Coordinator, scope: string) {
  const [allies, setAllies] = useState<SimulationAlly[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [state, setState] = useState<RunState | null>(null)
  const sequence = useRef(0)
  useEffect(
    () => () => {
      sequence.current++
    },
    [scope],
  )
  function edit(values: Record<string, string>) {
    sequence.current++
    setEdits((previous) => ({ ...previous, ...values }))
    setState(null)
  }
  async function run(inputs: SimulationInputs) {
    const token = ++sequence.current
    setState({ scope, status: 'running' })
    try {
      const response = await model.simulate(inputs)
      if (sequence.current === token)
        setState({ scope, status: 'done', response })
    } catch (e) {
      if (sequence.current === token)
        setState({
          scope,
          status: 'error',
          message:
            e instanceof Error
              ? `Simulation failed: ${e.message}. Try again.`
              : 'Simulation failed. Try again.',
        })
    }
  }
  const current = state?.scope === scope ? state : null
  return {
    allies,
    addAlly: (side: 'attacker' | 'defender') => {
      edit({})
      setAllies((previous) =>
        previous.filter((a) => a.side === side).length >=
        (side === 'attacker' ? 15 : 16)
          ? previous
          : [...previous, { id: crypto.randomUUID(), side }],
      )
    },
    removeAlly: (id: string) => {
      edit({})
      setAllies((previous) => previous.filter((a) => a.id !== id))
    },
    edits,
    result: current?.status === 'done' ? current.response : null,
    error: current?.status === 'error' ? current.message : null,
    running: current?.status === 'running',
    edit,
    run,
  }
}
