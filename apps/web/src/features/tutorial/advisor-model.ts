import type { TutorialData } from '../../client-model/tutorial-engine'
import type { Route } from '../../shell/routes'

/** Tutorial triggers and authored explanations belong here, never in catalog pages. */
export const advisorLessons = {
  'solar-power': {
    title: 'Power comes first',
    triggerLabel: 'Solar Plant guidance',
    paragraphs: [
      'Your Solar Plant supplies the energy your mines need. Start here so your first mines can run at full output.',
      'Watch the energy balance as you build. A negative balance slows mining; stored resources stay safe.',
    ],
  },
  'growing-mines': {
    title: 'Growing mines need power',
    triggerLabel: 'Energy demand guidance',
    paragraphs: [
      'Higher mine levels produce more resources and use more energy.',
      'Metal Mine level 2 can outgrow your first Solar Plant. If energy turns negative, your mines run below full output until you add power or reduce demand.',
    ],
  },
  'restore-power': {
    title: 'Bring production back up',
    triggerLabel: 'Energy shortage guidance',
    paragraphs: [
      'When demand exceeds supply, your mines share the available power and produce less.',
      'More solar capacity raises that limit. Check the energy balance and production factor after the upgrade.',
    ],
  },
  'production-settings': {
    title: 'Put your power to work',
    triggerLabel: 'Production settings guidance',
    paragraphs: [
      'Each percentage controls a producer’s output. Lowering a mine’s output also lowers its energy demand.',
      'During a power shortage, reduce a resource you need less to free energy for the others. Keep solar output at 100% unless you have a reason to lower it.',
      'Changes save automatically. Review the controls; you can keep your current settings.',
    ],
  },
  'metal-mine': {
    title: 'Your Metal Mine',
    triggerLabel: 'Metal Mine guidance',
    paragraphs: [
      'This is where your colony starts producing its own metal. You’ll use metal to build and upgrade buildings, then to construct ships and defenses.',
      'Build your first mine to increase production. It needs energy to work at full output. Higher mine levels produce more metal and need more power.',
    ],
  },
} as const
export type AdvisorLessonId = keyof typeof advisorLessons

export function advisorLesson(
  tutorial: TutorialData | null,
  route: Pick<Route, 'available' | 'page' | 'item'>,
): AdvisorLessonId | null {
  if (!tutorial?.enrolled || !route.available) return null
  const objectives = tutorial.chapters.flatMap((chapter) => chapter.objectives)
  const completed = (id: string) =>
    objectives.some((objective) => objective.id === id && objective.completed)
  if (
    route.page === 'resource-settings' &&
    objectives.some(
      (objective) =>
        objective.id === 'production-settings' && !objective.completed,
    )
  )
    return 'production-settings'
  if (!tutorial.beginner) return null
  if (route.page === 'resources') {
    if (route.item === 'SolarPlant') {
      if (completed('metal-2') && !completed('solar-2')) return 'restore-power'
      if (!completed('solar-1') && !completed('solar-2')) return 'solar-power'
    }
    if (route.item === 'MetalMine' && !completed('metal-2'))
      return completed('metal-1') ? 'growing-mines' : 'metal-mine'
  }
  return null
}
