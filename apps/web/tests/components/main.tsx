import '../../src/style.css'
import { useState, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Button } from '../../src/ui/button'
import { Field, Form, Input, NumberInput } from '../../src/ui/form'
import { LoadingRegion } from '../../src/ui/loading-region'

function NumberForm() {
  const [quantity, setQuantity] = useState('0')
  const [submitted, setSubmitted] = useState<string | null>(null)
  return (
    <Form
      aria-label="Order"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(quantity)
      }}
    >
      <Field>
        Quantity
        <NumberInput
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </Field>
      <Button type="submit">Submit order</Button>
      <output aria-label="Submitted quantity">
        {submitted ?? 'Not submitted'}
      </output>
    </Form>
  )
}

function LoadingExample() {
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  return (
    <main>
      <Field>
        Search
        <Input defaultValue="STAR" />
      </Field>
      <Button onClick={() => setLoading(true)}>Begin request</Button>
      <Button
        onClick={() => {
          setReady(true)
          setLoading(false)
        }}
      >
        Complete request
      </Button>
      <section aria-label="Results">
        <LoadingRegion loading={loading} label="Loading results…">
          <h1>{ready ? 'No matching results' : 'STAR'}</h1>
        </LoadingRegion>
      </section>
    </main>
  )
}

const scenarios: Record<string, () => Promise<ComponentType>> = {
  timestamp: async () => (await import('./timestamp.scenario')).TimestampScenario,
  'cosmetic-treatments': async () =>
    (await import('./cosmetic-treatments.scenarios'))
      .CosmeticTreatmentsScenario,
  resources: async () =>
    (await import('./resources.scenarios')).ResourcesScenario,
  'alliance-presentation': async () =>
    (await import('./alliance-presentation.story')).AlliancePresentationStory,
  'profile-display': async () =>
    (await import('./profile-display.scenarios')).ProfileDisplayScenario,
  'hud-toasts': async () =>
    (await import('./hud-toasts.scenarios')).HudToastsScenario,
  'progression-detail': async () =>
    (await import('./progression.scenarios')).ProgressionDetailScenario,
  'progression-comparison': async () =>
    (await import('./progression-comparison.scenario'))
      .ProgressionComparisonScenario,
  'shell-account-link': async () =>
    (await import('./shell.story')).ShellAccountLink,
  'shell-default': async () => (await import('./shell.story')).ShellDefault,
  'shell-alliance-threat': async () =>
    (await import('./shell.story')).ShellAllianceThreat,
  'shell-named': async () => (await import('./shell.story')).ShellNamed,
  'shell-worlds': async () => (await import('./shell.story')).ShellWorlds,
  'shell-roster': async () => (await import('./shell.story')).ShellRoster,
  'shell-badges': async () => (await import('./shell.story')).ShellBadges,
  'shell-large-stocks': async () =>
    (await import('./shell.story')).ShellLargeStocks,
  'shell-wide-stocks': async () =>
    (await import('./shell.story')).ShellWideStocks,
  'social-workspace': async () => (await import('./social.story')).SocialStory,
  'alliance-panels': async () =>
    (await import('./alliance.story')).AllianceStory,
  'alliance-recruit': async () =>
    (await import('./alliance.story')).RecruitStory,
  'alliance-directory': async () =>
    (await import('./recruitment.story')).RecruitmentStory,
  'public-alliance-directory': async () =>
    (await import('./recruitment.story')).PublicRecruitmentStory,
  'quick-fleet': async () => (await import('./quick-fleet')).QuickFleetScene,
  dispatch: async () => (await import('./dispatch')).DispatchScene,
  'dispatch-historical': async () =>
    (await import('./dispatch')).DispatchHistoricalScene,
  'dispatch-unknown': async () =>
    (await import('./dispatch')).DispatchUnknownScene,
  'galaxy-position': async () =>
    (await import('./galaxy-position.scenarios')).GalaxyPositionScenario,
  'fleet-cards-article': async () =>
    (await import('./fleet-card.scenarios')).FleetArticleScenario,
  'fleet-cards-list': async () =>
    (await import('./fleet-card.scenarios')).FleetListScenario,
  'settings-vacation': async () =>
    (await import('./tutorial-settings.scenarios')).VacationScenario,
  'settings-deletion': async () =>
    (await import('./tutorial-settings.scenarios')).EmpireDeletionScenario,
  'tutorial-chapters': async () =>
    (await import('./tutorial-settings.scenarios')).TutorialChaptersScenario,
  'tutorial-experience': async () =>
    (await import('./tutorial-settings.scenarios')).TutorialExperienceScenario,
  'tutorial-reward': async () =>
    (await import('./tutorial-settings.scenarios')).TutorialRewardScenario,
  'galaxy-harvest': async () =>
    (await import('./galaxy-fleet.scenarios')).GalaxyHarvestScenario,
  'fleet-inventory': async () =>
    (await import('./galaxy-fleet.scenarios')).FleetInventoryScenario,
  'galaxy-disclosure': async () =>
    (await import('./galaxy-fleet.scenarios')).GalaxyDisclosureScenario,
  popover: async () => (await import('./popover')).PopoverExample,
  'number-form': async () => NumberForm,
  loading: async () => LoadingExample,
  'action-sheet': async () =>
    (await import('../../src/dev/action-sheet-playground'))
      .ActionSheetPlayground,
  detail: async () =>
    (await import('../../src/dev/detail-playground')).DetailPlayground,
  identity: async () =>
    (await import('../../src/dev/identity-playground')).IdentityPlayground,
}
const paths: Record<string, string> = {
  '/detail-playground': 'detail',
  '/identity-playground': 'identity',
}
const name =
  new URL(location.href).searchParams.get('scenario') ??
  paths[location.pathname] ??
  ''
const load = scenarios[name]
if (!load) throw new Error(`Unknown component scenario: ${name}`)
const Scenario = await load()
flushSync(() =>
  createRoot(document.getElementById('root')!).render(<Scenario />),
)
document.documentElement.dataset.componentReady = name
