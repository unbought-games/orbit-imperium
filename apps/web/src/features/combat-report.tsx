import type { ReactNode } from 'react'
import { CoordinateLink } from './coordinate-link'
import { PlayerName } from './player-name'
import type { PlayerNames } from './player-label'
import { Heading } from '../ui/typography'
import { NumberValue } from '../ui/number-value'
import {
  combatInteger,
  combatReportModel,
  type CombatForce,
  type Observation,
} from './combat-report-model'
import styles from './combat-report.module.css'

function Amount({
  value,
  divisor = 1,
}: {
  value: bigint | null
  divisor?: number
}) {
  return value === null ? (
    <>Unknown</>
  ) : (
    <NumberValue value={value} divisor={divisor} />
  )
}

function ForceTable({
  force,
  recovery = false,
  settled = false,
}: {
  force: Pick<CombatForce, 'rows' | 'name' | 'side'>
  recovery?: boolean
  settled?: boolean
}) {
  return (
    <div
      className={styles.tableScroll}
      tabIndex={0}
      role="region"
      aria-label={`${force.side} ${force.name} unit counts`}
    >
      <table className={styles.units}>
        <thead>
          <tr>
            <th scope="col">Unit</th>
            <th scope="col">Start</th>
            <th scope="col">Survived</th>
            {recovery && <th scope="col">Recovered</th>}
            <th scope="col">{settled ? 'Lost' : 'Destroyed'}</th>
          </tr>
        </thead>
        <tbody>
          {force.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.name}</th>
              <td>
                <Amount value={row.start} />
              </td>
              <td>
                <Amount value={row.finish} />
              </td>
              {recovery && (
                <td>
                  <Amount value={row.recovered} />
                </td>
              )}
              <td className={styles.lossNumber}>
                <Amount value={settled ? row.permanent : row.lost} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!force.rows.length && <p className={styles.note}>No units.</p>}
    </div>
  )
}
function Fire({ value }: { value: Observation }) {
  return (
    <dl className={styles.fire}>
      <div>
        <dt>Shots fired</dt>
        <dd>
          <Amount value={combatInteger(value.shots)} />
        </dd>
      </div>
      <div>
        <dt>Attack power</dt>
        <dd>
          <Amount
            value={combatInteger(value.raw_attack_ticks)}
            divisor={100000}
          />
        </dd>
      </div>
      <div>
        <dt>Shield damage dealt</dt>
        <dd>
          <Amount
            value={combatInteger(value.shield_removed_ticks)}
            divisor={100000}
          />
        </dd>
      </div>
      <div>
        <dt>Hull damage dealt</dt>
        <dd>
          <Amount
            value={combatInteger(value.hull_removed_ticks)}
            divisor={100000}
          />
        </dd>
      </div>
      <div>
        <dt>Explosions caused</dt>
        <dd>
          <Amount value={combatInteger(value.explosions)} />
        </dd>
      </div>
    </dl>
  )
}
function ForceCard({ force }: { force: CombatForce }) {
  const recovered = force.recovered !== null && force.recovered > 0n
  return (
    <article
      className={styles.force}
      aria-label={`${force.side} ${force.name}`}
    >
      <header className={styles.forceHeader}>
        <span className={styles.side}>{force.side}</span>
        <h3>
          <PlayerName player={force.owner} fallback={force.name} />
        </h3>
      </header>
      <div className={styles.strength}>
        <strong>
          <Amount value={force.start} />
        </strong>
        <span aria-label="to">→</span>
        <strong>
          <Amount value={force.finish} />
        </strong>
        <span className={styles.note}>survived</span>
      </div>
      <p className={styles.lossSummary}>
        <Amount value={force.permanent} /> permanently lost
        {recovered && (
          <>
            {' '}
            · <Amount value={force.recovered} /> defenses recovered
          </>
        )}
      </p>
      <p className={styles.technology}>
        {force.technology ? (
          <>
            Weapons {force.technology[0]} · Shields {force.technology[1]} ·
            Armour {force.technology[2]}
          </>
        ) : (
          'Technology levels not recorded'
        )}
      </p>
      <ForceTable force={force} recovery={recovered} settled />
    </article>
  )
}
export function CombatReport({
  payload,
  viewer,
  playerNames,
  actions,
}: {
  payload: Observation
  viewer?: string
  playerNames?: PlayerNames
  actions?: ReactNode
}) {
  const report = combatReportModel(payload, viewer, playerNames)
  return (
    <section aria-label="Report observation" className={styles.report}>
      <header className={`${styles.outcome} ${styles[report.tone]}`}>
        <p className={styles.kicker}>
          Combat report ·{' '}
          <CoordinateLink at={payload.target} label="target">
            {report.target}
          </CoordinateLink>
          {report.side && ` · You were the ${report.side.toLowerCase()}`}
        </p>
        <Heading level={2} className={styles.result}>
          {report.symbol && <span aria-hidden="true">{report.symbol} </span>}
          {report.title}
        </Heading>
        <p className={styles.explanation}>
          {report.explanation} {report.rounds.length}{' '}
          {report.rounds.length === 1 ? 'round' : 'rounds'}.
        </p>
        {report.returnAt !== null && (
          <p className={styles.note}>
            Survivors return {new Date(report.returnAt).toLocaleString()}.
          </p>
        )}
        {report.noReturn && (
          <p className={styles.note}>No surviving return fleet.</p>
        )}
        {report.espionage && (
          <p className={styles.note}>
            Combat followed detection during espionage. No loot is taken.
          </p>
        )}
      </header>
      {actions}
      <div className={styles.resources}>
        {report.resources.map((group) => (
          <div className={styles.resourceGroup} key={group.key}>
            <h3>{group.title}</h3>
            <dl>
              {group.values.map(({ resource, value }) => (
                <div key={resource}>
                  <dt>{resource}</dt>
                  <dd>
                    <Amount value={value} divisor={1000000} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <section aria-label="Forces and losses" className={styles.forceSection}>
        <div className={styles.sectionHeading}>
          <Heading level={3}>Forces & losses</Heading>
          <p className={styles.note}>Lost excludes recovered defenses.</p>
        </div>
        <div className={styles.sides}>
          {report.forces.map((force) => (
            <ForceCard key={force.key} force={force} />
          ))}
        </div>
      </section>
      <section aria-label="Combat rounds" className={styles.roundSection}>
        <div className={styles.sectionHeading}>
          <Heading level={3}>How the battle unfolded</Heading>
          <p className={styles.note}>
            Each row follows the same units from start to finish.
          </p>
        </div>
        {!report.rounds.length && (
          <p className={styles.note}>No combat rounds recorded.</p>
        )}
        {report.rounds.map((round) => (
          <details key={String(round.number)} className={styles.round}>
            <summary>
              <span className={styles.roundLabel}>
                Round {String(round.number)}
              </span>
              <span className={styles.roundSummary}>
                {round.forces.map((force) => (
                  <span key={force.key}>
                    <span className={styles.side}>
                      {force.side} ·{' '}
                      <PlayerName player={force.owner} fallback={force.name} />
                    </span>
                    <span>
                      <Amount value={force.start} /> →{' '}
                      <Amount value={force.finish} />{' '}
                      <span className={styles.lossNumber}>
                        (−
                        <Amount value={force.lost} />)
                      </span>
                    </span>
                  </span>
                ))}
              </span>
              <span className={styles.expand} aria-hidden="true">
                +
              </span>
            </summary>
            <div className={styles.roundBody}>
              {round.legacy && (
                <div className={styles.legacy}>
                  <p>
                    This older report recorded shots and damage for both sides
                    combined. Per-player damage is unavailable.
                  </p>
                  <Fire value={round.combined} />
                </div>
              )}
              <div className={styles.sides}>
                {round.forces.map((force) => (
                  <article
                    className={styles.roundForce}
                    key={force.key}
                    aria-label={`Round ${String(round.number)} ${force.side} ${force.name}`}
                  >
                    <h4>
                      {force.side} ·{' '}
                      <PlayerName player={force.owner} fallback={force.name} />
                    </h4>
                    {force.fire ? (
                      <>
                        <p className={styles.note}>
                          Fire into the opposing force · damage in points
                        </p>
                        <Fire value={force.fire} />
                      </>
                    ) : (
                      !round.legacy && (
                        <p className={styles.note}>
                          Damage not recorded for this participant.
                        </p>
                      )
                    )}
                    <ForceTable force={force} />
                  </article>
                ))}
              </div>
            </div>
          </details>
        ))}
      </section>
      <details className={styles.rules}>
        <summary>How to read this battle</summary>
        <div>
          <p>
            <strong>Both sides fire.</strong> Every unit present at the start of
            a round gets to fire, even if destroyed in that round. Targets are
            chosen at random; rapid fire can add shots.
          </p>
          <p>
            <strong>Shields, then hull.</strong> Shields recharge between
            rounds. Hull damage carries over. Attack power is the raw firepower
            sent; shield and hull damage are the amounts actually removed. Very
            weak hits can bounce off shields.
          </p>
          <p>
            <strong>Explosions matter.</strong> Damaged units can explode before
            their hull reaches zero. Hull damage does not include the remaining
            hull lost in an explosion. A higher attack stat alone does not
            guarantee a win.
          </p>
          <p>
            <strong>Recovery happens afterward.</strong> Destroyed defenses can
            be restored after the battle. “Lost” excludes recovered defenses;
            they did not survive the fighting. Ships do not recover.
          </p>
        </div>
      </details>
    </section>
  )
}
