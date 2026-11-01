import styles from './empire-deletion.module.css'
import type { components } from '../contracts'
import { Link } from '../ui/link'
import { routeTarget } from '../shell/route-target'
import { useGameScreen } from '../shell/screen-context'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { Button } from '../ui/button'
import { ConfirmationButton } from '../ui/confirmation-button'
import { useEmpireDeletion } from './use-empire-deletion'

export function EmpireDeletion() {
  const { view, model, universeName } = useGameScreen()
  const action = useEmpireDeletion(model)
  if (view.protocol !== 4) return null
  const deletion = view.empire_deletion
  return (
    <Section aria-label="Delete empire">
      <Heading level={2}>Delete empire</Heading>
      <Text>
        Delete your empire in {universeName}. Your Unbought Games account and
        empires in other universes are unaffected.
      </Text>
      {deletion ? (
        <Text>
          {deletion.reason === 'Requested'
            ? 'You requested deletion.'
            : 'This empire is scheduled for inactivity cleanup.'}{' '}
          Removal is scheduled for{' '}
          <time dateTime={new Date(deletion.due_at).toISOString()}>
            {new Date(deletion.due_at).toLocaleString()}
          </time>
          . Flights and unfinished work cannot extend this deadline.
        </Text>
      ) : (
        <Text>
          You have seven days to cancel after requesting deletion. At the
          deadline, all your planets, moons, fleets, resources, and unfinished
          work are permanently removed.
        </Text>
      )}
      <div className={styles.actions}>
        {deletion?.reason === 'Requested' ? (
          <Button
            variant="secondary"
            disabled={action.pending || !action.ready}
            onClick={() => void action.submit('cancel')}
          >
            Cancel empire deletion
          </Button>
        ) : deletion?.reason === 'Inactivity' ? (
          <Button
            variant="primary"
            disabled={action.pending || !action.ready}
            onClick={() => void action.submit('keep')}
          >
            Keep my empire
          </Button>
        ) : (
          <>
            {view.leads_alliance && (
              <Text>
                Transfer alliance leadership or disband your alliance before
                requesting deletion.
              </Text>
            )}
            <ConfirmationButton
              variant="destructive"
              disabled={action.pending || !action.ready || view.leads_alliance}
              dialogTitle={`Delete your empire in ${universeName}?`}
              confirmLabel="Schedule empire deletion"
              cancelLabel="Keep my empire"
              review={
                <Text>
                  Your entire empire will be permanently removed after seven
                  days, including fleets in flight and their cargo. You can
                  cancel in Settings before the deadline. Signing in alone does
                  not cancel a deletion you requested. Your Unbought Games
                  account is preserved.
                </Text>
              }
              onConfirm={() => void action.submit('request')}
            >
              Request empire deletion
            </ConfirmationButton>
          </>
        )}
      </div>
      {deletion?.reason !== 'Inactivity' && (
        <Text>
          Requesting or canceling deletion requires a sign-in within the last
          five minutes.
        </Text>
      )}
      {action.error && <Text role="alert">{action.error}</Text>}
      {action.message && (
        <Text
          role={action.failed ? 'alert' : 'status'}
          tone={action.failed ? 'danger' : undefined}
        >
          {action.message}
        </Text>
      )}
      <Text>
        Inactive empires enter a seven-day grace period after 28 days and are
        removed after 35 days. Returning before removal cancels inactivity
        cleanup. Empires in vacation mode are exempt.
      </Text>
    </Section>
  )
}

export function EmpireDeletionNotice({
  deletion,
  universeName,
}: {
  deletion?: components['schemas']['EmpireDeletionStatus4']
  universeName: string
}) {
  if (!deletion) return null
  return (
    <Section aria-label="Empire deletion scheduled">
      <Text role="status">
        Your empire in {universeName} is scheduled for removal on{' '}
        {new Date(deletion.due_at).toLocaleString()}.{' '}
        <Link {...routeTarget(universeName, 'settings')}>
          Review deletion in Settings
        </Link>
      </Text>
    </Section>
  )
}
