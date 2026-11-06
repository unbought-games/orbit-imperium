import type { Page } from '../../shell/routes'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { useTutorial } from './use-tutorial'
import { hasIncompleteBriefing } from './model'
import styles from './tutorial.module.css'

/** Presentation changes reveal navigation; progress and rewards stay authoritative. */
export function TutorialExperienceAction({ page }: { page: Page }) {
  const tutorial = useTutorial()
  if (
    page !== 'briefing' ||
    !tutorial.data?.beginner ||
    !hasIncompleteBriefing(tutorial.data)
  )
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
        disabled={tutorial.pending}
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
        onConfirm={() => {
          if (tutorial.model.store.getState().tutorial.data?.beginner)
            void tutorial.setBeginner(false)
        }}
      >
        Enter Full Experience
      </ConfirmationButton>
    </div>
  )
}
