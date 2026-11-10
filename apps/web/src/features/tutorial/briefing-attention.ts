import type { TutorialData } from '../../client-model/tutorial-engine'

/** These IDs describe visits to acknowledge, never a second copy of progress. */
export function briefingAttentionEvents(data: TutorialData | null): string[] {
  if (!data?.enrolled) return []
  const prefix = `briefing:${data.program}:${data.version}:`
  return [
    ...(!data.completed ? [`${prefix}welcome`] : []),
    ...data.chapters.flatMap((chapter) =>
      chapter.objectives
        .filter((objective) => objective.completed)
        .map((objective) => `${prefix}completed:${objective.id}`),
    ),
  ]
}
