import { ActiveWorkDetails } from '../../src/features/progression/active-work-details'
export function CompletionDetails() {
  return (
    <main>
      <ActiveWorkDetails
        label="Active work"
        title="Metal Mine to level 2"
        accessibleTitle="Active construction"
        secondsRemaining={194400}
        dueAt={Date.parse('2027-01-02T18:00:00Z')}
        status="In progress"
        paid={{ metal: '60000000', crystal: '15000000', deuterium: '0' }}
      >
        {null}
      </ActiveWorkDetails>
    </main>
  )
}
