import { useContext, useEffect, useState, useRef } from 'react'
import { useStore } from 'zustand'
import { useCommunityRewards } from '../../shell/community-rewards-context'
import { InsigniaContext } from '../../shell/insignia-context'
import { useGameScreen } from '../../shell/screen-context'
import { routeTarget } from '../../shell/route-target'
import { pendingChoices } from '../../client-model/community-rewards'
import { Button, ButtonLink, ButtonLinkAnchor } from '../../ui/button'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { LoadingRegion } from '../../ui/loading-region'
import { Heading, Text } from '../../ui/typography'
import {
  RewardPreview,
  rewardScope,
  rewardPreviewAvailable,
} from './reward-preview'
import { InvitationCode, InvitationLinks } from './invitations'
import styles from './rewards.module.css'
export function RewardsScreen() {
  const { owner, controller, visible, loading, busy, error, pending } =
    useCommunityRewards()
  const { universeName, view } = useGameScreen()
  const insignias = useContext(InsigniaContext)
  if (!insignias) throw Error('Rewards previews require the cosmetic catalog')
  const library = useStore(insignias.store, (s) => s.snapshot)
  const [celebration, setCelebration] = useState<string | null>(null)
  const celebrationHeading = useRef<HTMLHeadingElement>(null)
  const choicesHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (celebration) celebrationHeading.current?.focus()
  }, [celebration])
  useEffect(() => {
    void controller.load()
    return insignias.start()
  }, [controller, insignias])
  const hasPending = owner?.claims.some((c) => c.delivery === 'pending')
  useEffect(() => {
    if (!hasPending) return
    const timer = setTimeout(() => void controller.load(), 5000)
    return () => clearTimeout(timer)
  }, [hasPending, owner, controller])
  const choices = owner ? pendingChoices(owner) : []
  const remainingChoices = choices.reduce((sum, m) => sum + m.remaining, 0)
  const reward = owner?.collection.find(
    (i) => i.reward_id === celebration,
  )?.reward
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <Heading level={1}>Community rewards</Heading>
          <Text>
            Your contributions across Unbought Games, and the rewards you keep.
          </Text>
        </div>
        <Button
          variant="ghost"
          disabled={loading || busy}
          onClick={() => void controller.load()}
        >
          Refresh
        </Button>
      </header>
      {error && (
        <div role="alert" className={styles.notice}>
          <p>{error}</p>
          {pending && (
            <Button disabled={busy} onClick={() => void controller.retry()}>
              Retry pending change
            </Button>
          )}
        </div>
      )}
      <LoadingRegion
        loading={loading && !owner}
        label="Loading your community rewards"
      >
        <div className={styles.content}>
          {!visible ? (
            <p>
              {loading
                ? 'Checking rewards availability…'
                : 'Community rewards are not active on this server.'}
            </p>
          ) : (
            owner && (
              <>
                <section
                  className={styles.progress}
                  aria-label="Renown progress"
                >
                  <div>
                    <span>Renown</span>
                    <strong>{owner.renown.display}</strong>
                    <small>Permanent contribution progress · never spent</small>
                  </div>
                  <div>
                    <h2>
                      {owner.next_milestone
                        ? `Next reward at ${owner.next_milestone.threshold} Renown`
                        : 'Your next chapter awaits'}
                    </h2>
                    <p>
                      {choices.length
                        ? `${remainingChoices} reward ${remainingChoices === 1 ? 'choice is' : 'choices are'} waiting for you.`
                        : 'New contributions bring the next reward closer.'}
                    </p>
                    <ButtonLinkAnchor
                      variant="ghost"
                      href={owner.capabilities.full_selection_url}
                    >
                      Full collection and history in Accounts ↗
                    </ButtonLinkAnchor>
                  </div>
                </section>
                {owner.program.status === 'paused' && (
                  <p role="status">
                    New rewards are temporarily paused. Your permanent
                    collection remains yours.
                  </p>
                )}
                {reward && (
                  <section className={styles.celebration} aria-live="polite">
                    <RewardPreview reward={reward} library={library} />
                    <div>
                      <h2 ref={celebrationHeading} tabIndex={-1}>
                        Yours permanently: {reward.name}
                      </h2>
                      <p>
                        {rewardScope(reward)}
                        {owner.collection.find((i) => i.reward_id === reward.id)
                          ?.delivery === 'pending'
                          ? ' · Delivery is on its way. You do not need to claim again.'
                          : ''}
                      </p>
                      {reward.kind === 'title' ? (
                        <ButtonLinkAnchor
                          href={`/profiles/empire/${view.binding.player}`}
                        >
                          Choose your empire title
                        </ButtonLinkAnchor>
                      ) : (
                        <ButtonLink {...routeTarget(universeName, 'settings')}>
                          Customize your insignia
                        </ButtonLink>
                      )}{' '}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setCelebration(null)
                          choicesHeading.current?.focus()
                        }}
                      >
                        Continue
                      </Button>
                    </div>
                  </section>
                )}
                <section aria-label="Your reward choices">
                  <h2 ref={choicesHeading} tabIndex={-1}>
                    Your choices
                  </h2>
                  {choices.length === 0 ? (
                    <p>
                      No choices are waiting right now. Your next milestone
                      appears above.
                    </p>
                  ) : (
                    choices.map((m) => (
                      <section key={m.id} className={styles.milestone}>
                        <header>
                          <h3>
                            {m.threshold
                              ? `${m.threshold} Renown`
                              : 'Welcome reward'}
                          </h3>
                          <p>
                            Choose {m.remaining} more · {m.selections} permanent
                            selection{m.selections === 1 ? '' : 's'} total
                            {m.bonus && m.bonus_awarded
                              ? ' · Membership bonus already awarded separately'
                              : ''}
                          </p>
                        </header>
                        {m.options.length === 0 ? (
                          <p>
                            You own every eligible item in this offer. Your
                            remaining choice stays available for future
                            additions.
                          </p>
                        ) : (
                          <div className={styles.options}>
                            {m.options.map((option) => (
                              <article
                                key={option.id}
                                className={styles.option}
                              >
                                <RewardPreview
                                  reward={option}
                                  ownedComponents={option.owned_components}
                                  library={library}
                                />
                                <div>
                                  <h4>{option.name}</h4>
                                  <span className={styles.scope}>
                                    {rewardScope(option)}
                                  </span>
                                  <p>
                                    {option.kind === 'dye'
                                      ? 'One permanent dye'
                                      : option.kind === 'emblem_set'
                                        ? 'Four permanent emblem elements'
                                        : 'Yours permanently'}
                                    {option.access === 'membership'
                                      ? ' · Keep it after membership ends'
                                      : ''}
                                  </p>
                                  {option.supported &&
                                    !rewardPreviewAvailable(
                                      option,
                                      library,
                                    ) && (
                                      <p>
                                        Preview content is unavailable. Refresh
                                        when it returns; your choice stays
                                        saved.
                                      </p>
                                    )}
                                  {!option.supported && (
                                    <p>Not supported in this game.</p>
                                  )}
                                  {!!option.owned_components?.length && (
                                    <p>
                                      {option.owned_components.length} of the
                                      four elements are already yours. This
                                      selection adds the remaining{' '}
                                      {4 - option.owned_components.length}{' '}
                                      permanently.
                                    </p>
                                  )}
                                  <ConfirmationButton
                                    dialogTitle={`Choose ${option.name}?`}
                                    confirmLabel="Claim permanently"
                                    confirmVariant="primary"
                                    cancelLabel="Keep browsing"
                                    disabled={
                                      busy ||
                                      !!pending ||
                                      !owner.capabilities.claim ||
                                      !option.supported ||
                                      !rewardPreviewAvailable(
                                        option,
                                        library,
                                      ) ||
                                      option.owned
                                    }
                                    review={
                                      <>
                                        {!!option.owned_components?.length && (
                                          <p>
                                            {option.owned_components.length}{' '}
                                            elements already owned;{' '}
                                            {4 - option.owned_components.length}{' '}
                                            new permanent elements.
                                          </p>
                                        )}
                                        <RewardPreview
                                          reward={option}
                                          ownedComponents={
                                            option.owned_components
                                          }
                                          library={library}
                                        />
                                        <p>
                                          {rewardScope(option)} · Uses one of{' '}
                                          {m.remaining} remaining selections.
                                        </p>
                                        <p>
                                          {option.kind === 'dye'
                                            ? 'This unlocks this one dye, not a whole palette.'
                                            : 'This choice is permanent.'}{' '}
                                          Membership bonuses are separate.
                                        </p>
                                      </>
                                    }
                                    onConfirm={() =>
                                      void controller
                                        .act({
                                          type: 'claim',
                                          milestone_id: m.id,
                                          reward_id: option.id,
                                          offer_version: m.offer_version,
                                        })
                                        .then((result) => {
                                          if (result) {
                                            setCelebration(option.id)
                                            void insignias.load()
                                          }
                                        })
                                    }
                                  >
                                    Choose this reward
                                  </ConfirmationButton>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
                    ))
                  )}
                </section>
                <section className={styles.membership} aria-label="Membership">
                  <h2>
                    {owner.membership.sources.includes('lifetime')
                      ? 'Lifetime membership'
                      : owner.membership.active
                        ? 'Membership is active'
                        : 'Membership time'}
                  </h2>
                  <p>
                    {owner.membership.active
                      ? 'Your common customization access is available across supported games.'
                      : 'Permanent rewards stay usable without membership.'}
                  </p>
                  {owner.membership.saved_seconds > 0 && (
                    <p>
                      {Math.floor(owner.membership.saved_seconds / 86400)} days
                      saved while paid coverage is active.
                    </p>
                  )}
                  <div className={styles.timeAwards}>
                    {owner.membership.awards
                      .filter((a) => a.state === 'available')
                      .map((award) => (
                        <div key={award.id}>
                          <strong>
                            {Math.floor(award.seconds / 86400)} days available
                          </strong>
                          <Button
                            variant="secondary"
                            disabled={busy || !!pending}
                            onClick={() =>
                              void controller.act({
                                type: 'activate_time',
                                award_id: award.id,
                              })
                            }
                          >
                            Activate
                            {owner.membership.sources.includes('paid')
                              ? ' and save'
                              : ''}
                          </Button>
                          {award.giftable && (
                            <small>
                              Can be gifted before activation in Accounts.
                            </small>
                          )}
                        </div>
                      ))}
                  </div>
                  <ButtonLinkAnchor
                    variant="ghost"
                    href={
                      new URL(
                        '/account/membership',
                        owner.capabilities.full_selection_url,
                      ).href
                    }
                  >
                    Manage membership and gifts ↗
                  </ButtonLinkAnchor>
                </section>
                <section aria-label="Invite friends">
                  <h2>Bring a friend</h2>
                  <p>
                    <ButtonLinkAnchor variant="ghost" href="/invitations">
                      Manage your invitations →
                    </ButtonLinkAnchor>
                  </p>
                  <InvitationLinks universe={view.binding.universe} />
                  <p>
                    <ButtonLink
                      variant="ghost"
                      {...routeTarget(universeName, 'alliance')}
                    >
                      Alliance recruitment links →
                    </ButtonLink>
                  </p>
                  <InvitationCode />
                </section>
                <section aria-label="Referral milestones">
                  <h2>Your referrals</h2>
                  {owner.referrals.length === 0 ? (
                    <p>
                      Friends who join through your links and their milestones
                      will appear here.
                    </p>
                  ) : (
                    owner.referrals.map((referral) => (
                      <article key={referral.id} className={styles.referral}>
                        <h3>{referral.public_name ?? 'Former player'}</h3>
                        <ul>
                          {referral.stages.map((stage) => (
                            <li key={stage.id}>
                              <strong>
                                {stage.complete ? '✓ Complete' : 'Pending'}
                              </strong>{' '}
                              · {stage.renown} Renown{' '}
                              <span>{stage.requirement}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))
                  )}
                </section>
                <section aria-label="Permanent collection">
                  <h2>Yours permanently</h2>
                  <div className={styles.collection}>
                    {owner.collection
                      .filter((i) => i.permanent)
                      .map((item) => (
                        <article key={item.reward_id}>
                          {item.reward ? (
                            <>
                              <RewardPreview
                                reward={item.reward}
                                library={library}
                                quiet
                              />
                              <h3>{item.reward.name}</h3>
                              <small>{rewardScope(item.reward)}</small>
                            </>
                          ) : (
                            <>
                              <h3>Saved collectible</h3>
                              <p>
                                Its content is currently unavailable. Your
                                ownership is preserved.
                              </p>
                            </>
                          )}
                          <p>
                            {item.delivery === 'pending'
                              ? 'Delivery pending'
                              : !item.supported
                                ? 'Not supported here'
                                : 'Permanently owned'}
                          </p>
                        </article>
                      ))}
                  </div>
                </section>
              </>
            )
          )}
        </div>
      </LoadingRegion>
    </div>
  )
}
