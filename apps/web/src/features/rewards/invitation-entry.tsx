import { useEffect } from 'react'
import { useAuthSession } from '../../shell/auth-context'
import { useInvitationEntry } from '../../client-model/use-invitation-entry'
import {
  invitationEntryPath,
  invitationContinuation,
} from '../../client-model/invitation-entry'
import { oidcLoginPath } from '../../client-model/use-oidc'
import { PublicFrame } from '../public-frame'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { LoadingRegion } from '../../ui/loading-region'
import { Heading, Text } from '../../ui/typography'
import styles from './invitation-entry.module.css'

export function InvitationEntryPage({
  code,
  continuation,
}: {
  code: string
  continuation?: string
}) {
  const { runtime } = useAuthSession()
  const csrf =
    runtime.status === 'authenticated' ? runtime.session.csrf : undefined
  return (
    <InvitationLanding
      key={`${code}:${csrf ?? runtime.status}`}
      code={code}
      continuation={continuation}
      csrf={csrf}
      sessionUnavailable={runtime.status === 'unavailable'}
    />
  )
}

function InvitationLanding({
  code,
  continuation,
  csrf,
  sessionUnavailable,
}: {
  code: string
  continuation?: string
  csrf?: string
  sessionUnavailable: boolean
}) {
  const entry = useInvitationEntry(code, csrf)
  const onward = invitationContinuation(continuation, entry.preview?.alliance)
  const returnPath = invitationEntryPath(code, continuation)
  useEffect(() => {
    document.title = 'You’re invited · Orbit Imperium'
  }, [])
  return (
    <PublicFrame>
      <Heading level={1}>
        {entry.accepted
          ? 'Welcome aboard.'
          : 'You’re invited to Orbit Imperium.'}
      </Heading>
      <Text>
        Build your world, explore the galaxy and find your allies in a
        persistent strategy universe.
      </Text>
      <LoadingRegion loading={entry.loading} label="Checking your invitation">
        {entry.previewError && (
          <div role="alert">
            <p>{entry.previewError}</p>
            <Button onClick={entry.retryPreview}>Check invitation again</Button>
          </div>
        )}
        {entry.preview && (
          <section
            className={styles.attribution}
            aria-label="Invitation attribution"
          >
            <h2>
              {entry.accepted ? 'Invitation accepted' : 'Who receives credit'}
            </h2>
            <p>
              {entry.preview.inviter_name
                ? `Invited by ${entry.preview.inviter_name}.`
                : 'This invitation has no personal inviter.'}
            </p>
            <p>
              {entry.preview.alliance_name
                ? `Alliance credit: ${entry.preview.alliance_name}.`
                : 'No alliance receives credit.'}
            </p>
            {entry.preview.alliance_name && (
              <p>
                Accepting this invitation does not join the alliance. Its normal
                admission rules still apply.
              </p>
            )}
            {!csrf && (
              <p>
                Sign in or create your account to review the current attribution
                before accepting. Opening this link does not accept it.
              </p>
            )}
            {entry.error && <p role="alert">{entry.error}</p>}
            {entry.preview.attribution_locked ? (
              <div className={styles.actions}>
                <p role="status">
                  {entry.accepted
                    ? 'Your invitation is accepted. You can continue into the game.'
                    : 'You’ve already accepted another invitation. Your existing attribution stays in place.'}
                </p>
                <ButtonLinkAnchor href={onward}>
                  {onward === '/'
                    ? 'Continue to Orbit Imperium'
                    : 'Continue to your alliance invitation'}
                </ButtonLinkAnchor>
              </div>
            ) : sessionUnavailable ? (
              <p role="alert">
                Your sign-in could not be checked. Refresh this page before
                continuing.
              </p>
            ) : csrf ? (
              <>
                <p>This attribution is fixed when you accept.</p>
                {entry.pending ? (
                  <Button
                    disabled={entry.busy}
                    onClick={() => void entry.accept()}
                  >
                    Retry acceptance
                  </Button>
                ) : (
                  <ConfirmationButton
                    dialogTitle="Accept this invitation?"
                    confirmLabel="Accept invitation"
                    confirmVariant="primary"
                    cancelLabel="Keep reviewing"
                    disabled={
                      entry.busy ||
                      entry.loading ||
                      entry.preview.requires_game_check
                    }
                    review={
                      <>
                        <p>
                          {entry.preview.inviter_name ??
                            'Alliance-only invitation'}
                          {entry.preview.alliance_name
                            ? ` · ${entry.preview.alliance_name}`
                            : ''}
                        </p>
                        <p>
                          Your choice applies across Unbought Games and cannot
                          be replaced by another invitation.
                        </p>
                      </>
                    }
                    onConfirm={() => void entry.accept()}
                  >
                    Accept this attribution
                  </ConfirmationButton>
                )}
              </>
            ) : (
              returnPath && (
                <div className={styles.actions}>
                  <ButtonLinkAnchor
                    href={oidcLoginPath(returnPath, false, true)}
                  >
                    Create your account
                  </ButtonLinkAnchor>
                  <ButtonLinkAnchor
                    variant="secondary"
                    href={oidcLoginPath(returnPath)}
                  >
                    Sign in
                  </ButtonLinkAnchor>
                </div>
              )
            )}
          </section>
        )}
      </LoadingRegion>
      {!entry.preview?.attribution_locked && (
        <p>
          <ButtonLinkAnchor variant="ghost" href={onward}>
            Continue without accepting
          </ButtonLinkAnchor>
        </p>
      )}
    </PublicFrame>
  )
}
