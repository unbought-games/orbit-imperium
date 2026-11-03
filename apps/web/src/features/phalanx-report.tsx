import type { components } from '../contracts'
import { coordinates, label } from '../ui/format'
import { NumberValue, ResourceQuantity } from '../ui/number-value'
import { exactTime } from './mission-presentation'
import { Panel } from '../ui/panel'
import styles from './report-observation.module.css'
type S = components['schemas']
const endpoint = (e: S['PhalanxEndpoint4']) =>
  `${label(e.kind)} ${coordinates(e)}`
export function PhalanxReport({
  observation,
}: {
  observation: S['PhalanxReport4']
}) {
  const r = observation.report
  return (
    <Panel
      as="section"
      aria-label="Report observation"
      className={styles.observation}
    >
      <h3>Sensor Phalanx · historical observation</h3>
      <p>
        Observed {exactTime(r.at)}. This saved report does not update when
        reopened or refreshed.
      </p>
      <p>
        From {endpoint(r.source)} · Target {endpoint(r.target)}
      </p>
      <p>
        Paid <ResourceQuantity resource="deuterium" value={r.cost} /> from the
        source moon.
      </p>
      {!r.rows.length && (
        <p>
          No visible movements were observed. Hidden movements are not
          disclosed.
        </p>
      )}
      {r.rows.map((row, i) => (
        <section key={i}>
          <h4>
            {row.kind === 'Fleet'
              ? `${label(row.mission)} · ${label(row.phase)} · ${row.owner.name}`
              : `Missiles · ${row.attacker.name}`}
          </h4>
          <p>
            {row.kind === 'Fleet'
              ? `${endpoint(row.endpoints.effective_origin)} → ${endpoint(row.endpoints.effective_destination)}`
              : `${coordinates({ coordinates: row.source })} → ${endpoint(row.target)}`}
          </p>
          {row.kind === 'Fleet' && (
            <p>
              Original route: {endpoint(row.endpoints.original_origin)} →{' '}
              {endpoint(row.endpoints.original_destination)}
            </p>
          )}
          <p>
            <strong>
              {row.deadline.kind === 'HoldEnd'
                ? 'Hold ends'
                : row.deadline.kind === 'Return'
                  ? 'Return'
                  : row.deadline.kind}
              :
            </strong>{' '}
            {exactTime(row.deadline.at)}
          </p>
          {row.kind === 'Fleet' ? (
            <dl className={styles.grid}>
              {row.ships.map((s) => (
                <div key={s.ship_type}>
                  <dt>{label(s.ship_type)}</dt>
                  <dd>
                    <NumberValue value={s.count} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>
              <NumberValue value={row.count} /> Interplanetary Missiles
            </p>
          )}
        </section>
      ))}
      <p>
        Deadlines and ship counts reflect the observation time. Another
        observation requires an explicit paid scan in Galaxy.
      </p>
    </Panel>
  )
}
