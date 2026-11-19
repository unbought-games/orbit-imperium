import { useEffect, useState } from 'react'
import { ReportShareControl } from '../../src/features/report-share-control'
import { ReportStarButton } from '../../src/features/report-star-button'
import { Coordinator } from '../../src/client-model/coordinator'
import { mergeReportHeaders } from '../../src/client-model/report-state'
import { AuthContext } from '../../src/shell/auth-context'
import { readyFixture, id } from '../../src/test-support/bootstrap'

declare global {
  interface Window {
    reportSharingControls?: {
      receiveUnstar: () => void
      attempts: () => number
    }
  }
}
export function SharingControls() {
  const [{ model, session, header }] = useState(() => {
    const unexpected = async (): Promise<never> => {
      throw Error('Unexpected report-sharing control game request')
    }
    const model = new Coordinator(
      {
        currentBinding: unexpected,
        settings: unexpected,
        view: unexpected,
        quote: unexpected,
        submit: unexpected,
        receipt: unexpected,
      },
      {
        newId: () => crypto.randomUUID(),
        isOnline: () => true,
        monotonicNowMs: () => 1000,
      },
    )
    const { session, snapshot } = readyFixture(4)
    const header = {
      id: id(70),
      kind: 'Espionage' as const,
      observed_at: 1000,
      read: true,
      hidden: false,
      starred: true,
      shared: true,
    }
    model.store.setState({
      ready: true,
      binding: snapshot.view.binding,
      view: snapshot.view,
      reportHeaders: mergeReportHeaders(new Map(), [header], '1'),
    })
    return { model, session, header }
  })
  useEffect(() => {
    window.reportSharingControls = {
      receiveUnstar: () =>
        model.store.setState((s) => ({
          reportHeaders: mergeReportHeaders(
            s.reportHeaders,
            [{ ...header, starred: false }],
            '2',
          ),
        })),
      attempts: () => model.store.getState().attempts.size,
    }
    return () => {
      delete window.reportSharingControls
    }
  }, [header, model])
  return (
    <AuthContext.Provider
      value={{
        runtime: {
          signupEnabled: true,
          status: 'authenticated',
          session,
          source: 'document',
          game: { status: 'ready', model },
        },
        busy: false,
        message: '',
        errorRef: { current: null },
        login: () => {},
        clearMessage: () => {},
      }}
    >
      <ReportShareControl model={model} report={header.id} />
      <ReportStarButton model={model} report={header.id} />
    </AuthContext.Provider>
  )
}
