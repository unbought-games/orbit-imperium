import { Accordion } from '@base-ui/react/accordion'
import { Check, ChevronRight } from 'lucide-react'
import type { components } from '../../contracts'
import type { TutorialData } from '../../client-model/tutorial-engine'
import { ObjectiveOpenLink } from './objective-open'
import { ObjectiveReward, ObjectiveTitle } from './objective-card'
import { objectiveDescription, objectiveStatus } from './model'
import styles from './tutorial.module.css'

/** Chapter disclosure owns only local interaction; progression stays in its input. */
export function TutorialChapters({
  data,
  view,
  universeName,
}: {
  data: TutorialData
  view: components['schemas']['BoundView4']
  universeName: string
}) {
  return (
    <Accordion.Root className={styles.chapters} multiple>
      {data.chapters.map((c, index) => (
        <Accordion.Item key={c.id} value={c.id} className={styles.chapter}>
          <Accordion.Header className={styles.chapterHeading}>
            <Accordion.Trigger className={styles.chapterTrigger}>
              <span className={styles.chapterNumber}>
                {c.completed ? (
                  <Check size={16} aria-label="Complete" />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>
              <span className={styles.chapterTitle}>{c.title}</span>
              <small
                aria-label={`${c.objectives.filter((o) => o.completed).length} of ${c.objectives.length} completed`}
              >
                {c.objectives.filter((o) => o.completed).length}/
                {c.objectives.length}
              </small>
              <ChevronRight
                className={styles.chapterChevron}
                size={20}
                aria-hidden="true"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className={styles.chapterPanel}>
            <ol>
              {c.objectives.map((o) => {
                const status = objectiveStatus(o, data, view)
                return (
                  <li key={o.id} data-completed={o.completed || undefined}>
                    <span>
                      {o.completed ? (
                        <Check size={16} aria-label="Accomplished" />
                      ) : (
                        <span className={styles.dot} />
                      )}
                    </span>
                    <div className={styles.jobBody}>
                      <h4 className={styles.jobTitle}>
                        <ObjectiveTitle objective={o} />
                      </h4>
                      {!o.completed && (
                        <>
                          <p className={styles.jobExplanation}>
                            {objectiveDescription(o)}
                          </p>
                          {!status.ready && (
                            <p className={styles.jobStatus}>{status.text}</p>
                          )}
                          <ObjectiveReward reward={o.reward} variant="inline" />
                        </>
                      )}
                    </div>
                    {!o.completed && (
                      <ObjectiveOpenLink
                        objective={o}
                        data={data}
                        universe={universeName}
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
