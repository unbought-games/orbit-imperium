import type { DispatchDraft } from '../missions'
import { ReportAttackButton } from '../report-attack-button'
import type { Coordinator } from '../../client-model/coordinator'
import { useReports } from '../use-reports'
import { ReportObservation } from '../report-observation'
import { reportFailure } from '../report-failure'
import { Button, ButtonLink } from '../../ui/button'
import { routeTarget } from '../../shell/route-target'
import styles from './hud.module.css'
export function HudReport({
  model,
  report,
  universe,
  body,
  close,
  onDraft,
}: {
  model: Coordinator
  report: string
  universe: string
  body?: string
  close: () => void
  onDraft: (draft: DispatchDraft) => void
}) {
  const { detail, loading, error, retry } = useReports(model, report)
  return (
    <>
      {loading && !detail && <p role="status">Receiving report…</p>}
      {error !== null && (
        <>
          <p role="alert">{reportFailure(error).message}</p>
          <Button onClick={retry}>Retry report</Button>
        </>
      )}
      {detail && (
        <ReportObservation
          targetActions={
            <ReportAttackButton
              model={model}
              payload={detail.payload}
              observedAt={detail.header.observed_at}
              onDraft={(draft) => {
                close()
                onDraft(draft)
              }}
            />
          }
          payload={detail.payload}
          viewer={model.binding?.player}
          playerNames={detail.player_names}
          playerAlliances={detail.player_alliances}
        />
      )}
      <div className={styles.panelActions}>
        <ButtonLink
          {...routeTarget(universe, 'reports', body, report)}
          onClick={close}
        >
          Open full report
        </ButtonLink>
      </div>
    </>
  )
}
