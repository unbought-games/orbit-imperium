import type { TutorialData } from '../../client-model/tutorial-engine'
import type { Page } from '../../shell/routes'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { useTutorial } from './use-tutorial'
import { hasIncompleteBriefing } from './model'
import styles from './tutorial.module.css'

/** Presentation changes reveal navigation; progress and rewards stay authoritative. */
export function TutorialExperienceAction({ page }: { page: Page }) {
  const tutorial = useTutorial()
  return (
    <TutorialExperienceControl
      page={page}
      data={tutorial.data}
      pending={tutorial.pending}
      onConfirm={() => {
        if (tutorial.model.store.getState().tutorial.data?.beginner)
          void tutorial.setBeginner(false)
      }}
    />
  )
}

export function TutorialExperienceControl({
  page,
  data,
  pending,
  onConfirm,
}: {
  page: Page
  data: TutorialData | null
  pending: boolean
  onConfirm: () => void
}) {
  if (page !== 'briefing' || !data?.beginner || !hasIncompleteBriefing(data))
    return null
  return (
    <div className={styles.experienceAction}>
      <ConfirmationButton
        variant="secondary"
        size="compact"
        dialogTitle="Leave beginner mode?"
        confirmLabel="Enter Full Experience"
        confirmVariant="primary"
        cancelLabel="Stay in beginner mode"
        disabled={pending}
        review={
          <>
            <p>
              You're about to leave beginner mode and reveal the full game
              interface.
            </p>
            <p>
              You can keep following your Briefing and earning every reward. If
              you stay in beginner mode, more of the interface appears naturally
              as you progress.
            </p>
          </>
        }
        onConfirm={onConfirm}
      >
        Enter Full Experience
      </ConfirmationButton>
    </div>
  )
}
