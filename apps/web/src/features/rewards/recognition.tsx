import { useEffect, useState } from 'react'
import {
  communityRewardsApi,
  type CommunityAllianceHonors,
  type CosmeticMark,
} from '../../adapters/community-rewards'
import { TreatmentPreview } from './cosmetic-treatment'
import styles from './rewards.module.css'
export function RecognitionMark({ mark }: { mark: CosmeticMark }) {
  return (
    <span
      className={styles.recognition}
      role="img"
      aria-label={
        mark.render.kind === 'support_duration'
          ? `${mark.name} · ${mark.render.months} paid months`
          : mark.name
      }
      title={mark.name}
    >
      <span aria-hidden="true">✦</span>
      {mark.render.kind === 'support_duration' && (
        <strong>
          {mark.render.months}
          <small>months</small>
        </strong>
      )}
      <span>{mark.name}</span>
    </span>
  )
}
export function AllianceHonors({ alliance }: { alliance: string }) {
  const [data, setData] = useState<CommunityAllianceHonors | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    void communityRewardsApi('')
      .allianceHonors(alliance, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) setData(data)
      })
      .catch(() => {})
    return () => abort.abort()
  }, [alliance])
  if (data?.alliance_id !== alliance || !data.honors.length) return null
  return (
    <section className={styles.honors} aria-label="Alliance recruitment honors">
      <h3>Community honors</h3>
      <p>
        Recognition earned by this alliance. Commemorative awards belong to the
        members who qualified when each milestone was reached.
      </p>
      {data.honors.map((honor) => (
        <article key={`${honor.honor_id}:${honor.reward_id}`}>
          {honor.mark ? (
            <RecognitionMark mark={honor.mark} />
          ) : (
            <strong>Recorded alliance honor</strong>
          )}
          {honor.emblem_url && (
            <span
              className={styles.honorEmblem}
              role="img"
              aria-label={`${honor.mark?.name ?? 'Alliance'} ornament`}
              style={{
                mask: `url("${honor.emblem_url}") center / contain no-repeat`,
              }}
            />
          )}
          {honor.treatment && (
            <TreatmentPreview
              treatment={honor.treatment}
              label={`${honor.mark?.name ?? 'Alliance treatment'} preview`}
              quiet
            />
          )}
          <time dateTime={honor.reached_at}>
            {new Date(honor.reached_at).toLocaleDateString()}
          </time>
        </article>
      ))}
    </section>
  )
}
