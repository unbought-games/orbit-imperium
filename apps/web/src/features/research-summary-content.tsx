import { Clock3 } from 'lucide-react'
import type { researchProgress } from '../client-model/research-progress'
import type { routeTarget } from '../shell/route-target'
import { resolveCatalogArt } from '../ui/artwork'
import { label } from '../ui/format'
import { Link } from '../ui/link'
import styles from './work-summaries.module.css'

export function ResearchSummaryContent({
  research,
  targetLevel,
  target,
  host,
  work,
  countdown,
  percent,
}: {
  research: NonNullable<ReturnType<typeof researchProgress>>['research']
  targetLevel: number
  target: ReturnType<typeof routeTarget>
  host: string | null
  work: ReturnType<typeof researchProgress>
  countdown: string
  percent: number | null
}) {
  const art = resolveCatalogArt({ kind: 'Research', id: research })
  return (
    <Link
      {...target}
      data-touch-control=""
      className={styles.researchWork}
      title={host ?? undefined}
      aria-description={host ?? undefined}
    >
      <img
        src={art.thumbnail}
        srcSet={art.srcSet}
        sizes="80px"
        width={80}
        height={80}
        alt=""
        onError={(event) => {
          event.currentTarget.style.visibility = 'hidden'
        }}
        onLoad={(event) => {
          event.currentTarget.style.visibility = 'visible'
        }}
      />
      <span className={styles.researchCopy}>
        <span className={styles.researchTitle}>
          <strong>{label(research)}</strong>
          <span className={styles.researchLevel}>Level {targetLevel}</span>
        </span>
        <span className={styles.researchTiming}>
          <Clock3 size={14} aria-hidden="true" />
          {work?.countdown ?? countdown}
          {work?.secondsRemaining != null ? ' remaining' : ''}
          {work &&
            work.status !== 'In progress' &&
            work.status !== work.countdown && <span> · {work.status}</span>}
        </span>
        {percent !== null && (
          <progress
            aria-label="Research estimated progress"
            value={percent}
            max={100}
          />
        )}
      </span>
    </Link>
  )
}
