import { useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../../src/client-model/coordinator'
import type { Attempt } from '../../src/client-model/commands'
import { createGameStore } from '../../src/client-model/game-store'
import {
  mergeReportHeaders,
  projectedReportHeader,
} from '../../src/client-model/report-state'
import { readyFixture } from '../../src/test-support/bootstrap'
import { useReportCleanup } from '../../src/features/use-report-cleanup'
import { ReportSelectionBar } from '../../src/features/report-selection-bar'
import { Button } from '../../src/ui/button'

// Only the command transport is controlled. The real hook, selection component,
// live protection check and authoritative header projection execute unchanged.
function preparedCleanup() {
  const store = createGameStore()
  const { snapshot } = readyFixture(4)
  store.setState({
    ready: true,
    binding: snapshot.candidate.binding,
    view: snapshot.view,
    reportHeaders: mergeReportHeaders(
      new Map(),
      ['one', 'two', 'protected'].map((id) => ({
        id,
        kind: 'Espionage',
        read: true,
        hidden: false,
        starred: id === 'protected',
        observed_at: 1000,
      })),
      '1',
    ),
  })
  let complete: ((status: 'rejected' | 'uncertain') => void) | undefined
  let submitted = 0
  const send: Coordinator['send'] = async (command) => {
    const commandId = `command-${++submitted}`
    const attempt: Attempt = {
      envelope: {
        protocol: 4,
        binding: store.getState().binding!,
        command_id: commandId,
        presence: null,
        command,
      },
      status: 'submitting',
      receipt: null,
      reconciled: false,
    }
    store.setState({ attempts: new Map([[commandId, attempt]]) })
    await new Promise<void>((resolve) => {
      complete = (status) => {
        store.setState({
          attempts: new Map([[commandId, { ...attempt, status }]]),
        })
        complete = undefined
        resolve()
      }
    })
    return commandId
  }
  return {
    store,
    send,
    finish: (status: 'rejected' | 'uncertain') => complete?.(status),
    submitted: () => submitted,
  }
}

export function ReportCleanupScenario() {
  const [model] = useState(preparedCleanup)
  const [selected, select] = useState(new Set<string>())
  const cleanup = useReportCleanup(model, () => select(new Set()))
  const state = useStore(model.store)
  const reports = [...state.reportHeaders.keys()].map(
    (id) =>
      projectedReportHeader(state.reportHeaders, state.attempts.values(), id)!,
  )
  return (
    <main>
      <input aria-label="Report note" />
      <textarea aria-label="Report draft" />
      <select aria-label="Report kind" defaultValue="all">
        <option value="all">All</option>
        <option value="espionage">Espionage</option>
      </select>
      <div
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Rich note"
      >
        <span>Editable note</span>
      </div>
      <input type="checkbox" aria-label="Keyboard focus" />
      <ReportSelectionBar
        visible={reports.filter((row) => !row.hidden)}
        selected={selected}
        select={select}
        archived={false}
        disabled={false}
        cleanup={cleanup}
        onCancel={() => select(new Set())}
      />
      <ul aria-label="Visible reports">
        {reports
          .filter((row) => !row.hidden)
          .map((row) => (
            <li key={row.id}>{row.id}</li>
          ))}
      </ul>
      <output aria-label="Submitted commands">{model.submitted()}</output>
      <output aria-label="Stored archive flags">
        {[...state.reportHeaders.values()]
          .map((row) => String(row.header.hidden))
          .join(',')}
      </output>
      {cleanup.error && <p role="alert">{cleanup.error}</p>}
      <Button onClick={() => model.finish('rejected')}>
        Deliver rejection
      </Button>
      <Button onClick={() => model.finish('uncertain')}>
        Deliver uncertainty
      </Button>
    </main>
  )
}
