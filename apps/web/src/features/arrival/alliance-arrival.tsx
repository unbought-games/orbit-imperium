import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { AlliancesController } from '../../client-model/alliances'
import { usePublicAlliance } from '../../client-model/use-public-alliance'
import { useGameSession } from '../../shell/session-context'
import { useRefreshPlayerProfiles } from '../../shell/player-profiles-context'
import { commandId } from '../../adapters/command-id'
import { trackRecruitment } from '../../adapters/optional-services'
import { Button } from '../../ui/button'
import { Field, Textarea } from '../../ui/form'
import { LoadingRegion } from '../../ui/loading-region'
import { AllianceCrestMark } from '../alliances/visual-identity'
import styles from './arrival.module.css'

export function AllianceArrival({
  alliance,
  invitation,
  onContinue,
  onDismiss,
}: {
  alliance: string
  invitation?: string
  onContinue: () => void
  onDismiss: () => void
}) {
  const { model, view } = useGameSession(),
    refreshProfiles = useRefreshPlayerProfiles()
  const publicAlliance = usePublicAlliance(
    view.binding.universe,
    alliance,
    invitation,
  )
  const [controller] = useState(
    () =>
      new AlliancesController({
        read: (q) => model.allianceQuery(q),
        command: (r) => model.allianceCommand(r),
        newId: () => commandId(crypto),
      }),
  )
  const state = useStore(controller.store)
  const [message, setMessage] = useState('')
  useEffect(() => {
    void controller.refresh()
    return () => controller.clear()
  }, [controller])
  const data = publicAlliance.data,
    membership = state.view?.alliance,
    pending = state.view?.applications.some((a) => a.alliance === alliance)
  const busy = state.busy || state.loading || !!state.pending
  async function submit() {
    if (!data || !state.view || busy) return
    const action =
      data.summary.recruitment === 'Open'
        ? { type: 'Join' as const, alliance }
        : { type: 'Apply' as const, alliance, text: message }
    if (await controller.run(action)) {
      refreshProfiles()
      trackRecruitment(action.type === 'Join' ? 'joined' : 'applied')
    }
  }
  function dismiss() {
    onDismiss()
    onContinue()
  }
  return (
    <div className={styles.allianceArrival}>
      <p>One more thing, Commander.</p>
      <LoadingRegion
        loading={
          (!data && !publicAlliance.error) || (!state.view && state.loading)
        }
        label="Loading your alliance invitation…"
      >
        {data && (
          <>
            <div className={styles.allianceIdentity}>
              <AllianceCrestMark
                universe={view.binding.universe}
                identity={
                  data.presentation?.identity ?? data.summary.visual_identity
                }
              />
              <div>
                <span>[{data.summary.tag}]</span>
                <h2>{data.summary.name}</h2>
              </div>
            </div>
            {membership?.summary.id === alliance ? (
              <>
                <p>
                  You’re now part of {data.summary.name}. Your allies will be
                  waiting in the Hall.
                </p>
                <Button onClick={onContinue}>Continue</Button>
              </>
            ) : membership ? (
              <>
                <p>
                  You already belong to {membership.summary.name}. You can
                  review your alliance later.
                </p>
                <Button onClick={onContinue}>Continue</Button>
              </>
            ) : pending ? (
              <>
                <p>
                  Your application is with {data.summary.name}. You can start
                  building while they review it.
                </p>
                <Button onClick={onContinue}>Continue</Button>
              </>
            ) : data.summary.recruitment === 'Closed' ? (
              <p>
                This alliance has closed recruitment. You can still begin your
                empire.
              </p>
            ) : (
              state.view && (
                <>
                  <p>
                    You came here to find {data.summary.name}.{' '}
                    {data.summary.recruitment === 'Open'
                      ? 'Shall we join them?'
                      : 'Would you like to send your application now?'}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void submit()
                    }}
                  >
                    <fieldset disabled={busy}>
                      {data.summary.recruitment === 'Application' && (
                        <Field>
                          Introduce yourself
                          <Textarea
                            value={message}
                            maxLength={4000}
                            rows={4}
                            onChange={(e) => setMessage(e.target.value)}
                          />
                        </Field>
                      )}
                      <Button
                        type="submit"
                        disabled={
                          data.summary.recruitment === 'Application' &&
                          state.view.applications.length >= 5
                        }
                      >
                        {data.summary.recruitment === 'Open'
                          ? `Join ${data.summary.tag}`
                          : 'Send application'}
                      </Button>
                    </fieldset>
                  </form>
                </>
              )
            )}
          </>
        )}
        {publicAlliance.error && (
          <>
            <p role="alert">{publicAlliance.error}</p>
            <Button variant="secondary" onClick={publicAlliance.retry}>
              Retry invitation
            </Button>
          </>
        )}
        {state.error && <p role="alert">{state.error}</p>}
        {state.pending && !state.busy && (
          <Button
            onClick={() =>
              void controller.retry().then((ok) => {
                if (ok) refreshProfiles()
              })
            }
          >
            Retry last action
          </Button>
        )}
        {!state.view && state.error && (
          <Button variant="secondary" onClick={() => void controller.refresh()}>
            Refresh joining options
          </Button>
        )}
      </LoadingRegion>
      {!membership && !pending && (
        <Button
          variant="ghost"
          disabled={state.busy || !!state.pending}
          onClick={() => void dismiss()}
        >
          Not now · continue my arrival
        </Button>
      )}
    </div>
  )
}
