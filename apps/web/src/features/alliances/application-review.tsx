import type { ReactNode } from 'react'
import type { components } from '../../contracts'
import { can, type AllianceFailure } from '../../client-model/alliances'
import { useGameScreen } from '../../shell/screen-context'
import { routeTarget } from '../../shell/route-target'
import { ErrorBannerMessage } from '../../ui/error-banner'
import { Button, ButtonLink } from '../../ui/button'
import { ContentColumn } from '../../ui/content-column'
import { LoadingRegion } from '../../ui/loading-region'
import { TaskHeader } from '../../ui/task-header'
import { ApplicationCard } from './administration'
import type { Run } from './shared'
import styles from './alliances.module.css'
import applicationStyles from './applications.module.css'

export function ApplicationReview({
  applicationId,
  view,
  loading,
  busy,
  run,
  outcome,
  children,
}: {
  applicationId: string
  view: components['schemas']['AllianceView'] | null
  loading: boolean
  busy: boolean
  run: Run
  outcome?: string
  children: ReactNode
}) {
  const { universeName, body } = useGameScreen()
  const detail = view?.alliance
  const canReview = detail && can(detail, 'ProcessApplications')
  const application = canReview
    ? detail.applications?.find((a) => a.id === applicationId)
    : null
  return (
    <ContentColumn
      as="section"
      width="focused"
      className={styles.screen}
      aria-label="Alliance application"
    >
      <TaskHeader title="Alliance application">
        {view && (
          <ButtonLink
            variant="secondary"
            size="inline"
            {...routeTarget(
              universeName,
              'alliance',
              body?.id,
              canReview ? 'applications' : undefined,
            )}
          >
            {canReview ? 'All applications' : 'My alliance'}
          </ButtonLink>
        )}
      </TaskHeader>
      <LoadingRegion
        contentClassName={styles.stack}
        loading={loading && !view}
        label="Loading application…"
      >
        {children}
        {view &&
          (application && detail ? (
            <ApplicationCard
              detail={detail}
              application={application}
              run={run}
              busy={busy}
            />
          ) : (
            <p role="status">
              {canReview
                ? (outcome ?? 'This application is no longer pending.')
                : 'You no longer have access to review this application.'}
            </p>
          ))}
      </LoadingRegion>
    </ContentColumn>
  )
}

export function ApplicationReviewError({
  failure,
  application,
  retry,
  uncertain,
}: {
  failure: AllianceFailure
  application: string
  retry: () => void
  uncertain: boolean
}) {
  const reading = failure.operation === 'Mine'
  const message = reading
    ? 'Couldn’t load this application. Try again.'
    : uncertain
      ? 'Your decision could not be confirmed. Retry to check the same decision.'
      : failure.status === 409
        ? 'The alliance changed before your decision was saved. Check the current application below.'
        : 'Your decision could not be saved. Check your access and the current application.'
  const report = [
    `Orbit Imperium / alliance.application-review.${failure.operation}`,
    `Operation: ${failure.operation}`,
    `Condition: ${failure.condition}`,
    `Application: ${application}`,
    `Build: ${import.meta.env.ORBIT_CLIENT_BUILD ?? 'development'}`,
  ].join('\n')
  return (
    <ErrorBannerMessage>
      <p role="alert">{message}</p>
      <details>
        <summary>Details</summary>
        <pre className={applicationStyles.diagnostics}>{report}</pre>
      </details>
      {(reading || uncertain) && (
        <Button variant="secondary" onClick={retry}>
          {uncertain ? 'Retry decision' : 'Try again'}
        </Button>
      )}
    </ErrorBannerMessage>
  )
}
