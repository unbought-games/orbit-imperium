import { SimulationDisclosure } from './simulation-disclosure'
import { Fragment } from 'react'
import { Button } from '../ui/button'
import { FillButton, InputWithAction } from '../ui/input-with-action'
import { NumberInput } from '../ui/form'
import { VisuallyHidden } from '../ui/visually-hidden'
import { shipGroup, shipGroups } from './ship-order'
import { label } from '../ui/format'
import { formatWholeNumber } from '../ui/whole-number'
import {
  simulationGroupSummary,
  simulationUnitLimit,
  type SimulationField,
} from './combat-simulation-model'
import styles from './combat-simulation.module.css'
import type { SimulationUnitOutcomes } from './simulation-unit-outcomes'

type Props = {
  allySlot?: number
  fields: SimulationField[]
  edits: Record<string, string>
  edit: (values: Record<string, string>) => void
  outcomes?: SimulationUnitOutcomes | null
}

export function SimulationFields(props: Props) {
  return (
    <>
      {(['Technologies', 'Ships', 'Defenses'] as const).map((group) => {
        const members = props.fields.filter((f) =>
          group === 'Technologies'
            ? f.technology !== undefined
            : f.item?.kind === (group === 'Ships' ? 'Ship' : 'Defense'),
        )
        return members.length ? (
          <FieldGroup key={group} {...props} fields={members} group={group} />
        ) : null
      })}
    </>
  )
}

function FieldGroup({
  fields,
  edits,
  edit,
  outcomes,
  group,
  allySlot,
}: Props & { group: string }) {
  const defender = fields[0].side === 'defender'
  const collapsible = defender && group !== 'Technologies'
  const summary =
    group === 'Technologies' ? null : simulationGroupSummary(fields, edits)
  const heading = (
    <>
      {group}
      {summary && (
        <>
          {' '}
          <span className={styles.groupSummary}>
            {formatWholeNumber(summary.total)}{' '}
            {summary.total === 1n ? 'unit' : 'units'}
            {summary.unknown > 0 && (
              <span> · {summary.unknown} not observed; assumed zero</span>
            )}
            {summary.invalid > 0 && (
              <strong role="alert">
                {' '}
                · {summary.invalid} invalid values
                {collapsible && ' — expand to edit'}
              </strong>
            )}
          </span>
        </>
      )}
    </>
  )
  const groups =
    group === 'Ships'
      ? shipGroups.map((name) => ({
          name,
          fields: fields.filter(
            (field) => field.item && shipGroup({ key: field.item }) === name,
          ),
        }))
      : [{ name: '', fields }]
  const contents = groups
    .filter((group) => group.fields.length)
    .map((group) => (
      <Fragment key={group.name}>
        {outcomes !== undefined && group.fields[0].item ? (
          <div className={`${styles.fieldWithOutcome} ${styles.fieldColumns}`}>
            {group.name ? (
              <h4 className={styles.shipSubtype}>{group.name}</h4>
            ) : (
              <span>Unit</span>
            )}
            <span className={styles.startingHeading}>Start</span>
            <div className={styles.unitOutcome}>
              <span>Remaining</span>
            </div>
          </div>
        ) : (
          group.name && <h4 className={styles.shipSubtype}>{group.name}</h4>
        )}
        {group.fields.map((field) => (
          <SimulationFieldInput
            key={field.key}
            field={field}
            edits={edits}
            edit={edit}
            outcomes={outcomes}
          />
        ))}
      </Fragment>
    ))
  return (
    <section
      className={
        fields[0].available !== undefined ? styles.stationedShips : undefined
      }
      aria-label={`${defender ? 'Defender' : 'Attacker'} ${group.toLowerCase()}`}
    >
      {collapsible ? (
        <SimulationDisclosure
          section={
            allySlot
              ? `allied-fleet-${allySlot}-ships`
              : group === 'Ships'
                ? 'defender-ships'
                : 'defender-defenses'
          }
          className={styles.fieldGroup}
          summaryClassName={styles.groupHeading}
          summary={heading}
        >
          {contents}
        </SimulationDisclosure>
      ) : (
        <>
          <h3 className={styles.groupHeading}>{heading}</h3>
          {contents}
        </>
      )}
    </section>
  )
}

function SimulationFieldInput({
  field,
  edits,
  edit,
  outcomes,
}: Omit<Props, 'fields'> & { field: SimulationField }) {
  const showOutcome = field.item !== undefined && outcomes !== undefined
  const outcome =
    field.item && outcomes
      ? (outcomes[`${field.item.kind}:${field.item.id}`] ?? {
          remaining: 0,
        })
      : null
  const value = edits[field.key] ?? field.value ?? '0'
  const invalid =
    !/^(0|[1-9][0-9]*)$/.test(value || '0') ||
    Number(value) > (field.item ? simulationUnitLimit : 100)
  const changed =
    edits[field.key] !== undefined && value !== (field.value ?? '0')
  const source =
    field.source === 'Report'
      ? changed
        ? `Differs from report${field.value !== null ? ` · was ${field.value}` : ''}`
        : field.value === null
          ? 'Not observed'
          : 'Report'
      : field.source === 'Imported plan'
        ? 'Imported'
        : field.source === 'Your research'
          ? changed
            ? 'Changed'
            : 'Your research'
          : ''
  const available = field.available
  const fillAvailable = () => {
    if (available !== undefined) edit({ [field.key]: available })
  }
  const input = (
    <NumberInput
      id={`simulation-${field.key}`}
      aria-label={`${field.side === 'attacker' ? 'Attacker' : 'Defender'} ${label(field.label)}`}
      aria-invalid={invalid || undefined}
      value={value}
      placeholder="0"
      onChange={(event) => edit({ [field.key]: event.target.value })}
    />
  )
  return (
    <div
      className={`${styles.field} ${outcomes !== undefined ? styles.fieldWithOutcome : ''} ${field.technology !== undefined ? styles.technologyField : ''} ${value && value !== '0' ? styles.nonzero : ''}`}
    >
      <div>
        <label htmlFor={`simulation-${field.key}`} title={source}>
          {label(field.label)}
        </label>
        {available !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="small"
            className={styles.available}
            aria-label={`Use all ${formatWholeNumber(available)} available ${label(field.label)}`}
            title="Fill with ships stationed at this origin"
            onClick={fillAvailable}
          >
            {formatWholeNumber(available)} available
          </Button>
        ) : (
          source && <small>{source}</small>
        )}
      </div>
      {available === undefined ? (
        input
      ) : (
        <InputWithAction>
          {input}
          <FillButton
            aria-label={`Add all ${label(field.label)}`}
            title={`Add all ${formatWholeNumber(available)} available ${label(field.label)}`}
            onClick={fillAvailable}
          />
        </InputWithAction>
      )}
      {showOutcome && (
        <div
          className={styles.unitOutcome}
          role="group"
          aria-label={`${field.side === 'attacker' ? 'Attacker' : 'Defender'} ${label(field.label)} average outcome`}
        >
          <div title="Average remaining">
            <strong>
              {outcome
                ? outcome.remaining.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })
                : '—'}
            </strong>
            <VisuallyHidden> remaining</VisuallyHidden>
          </div>
        </div>
      )}
    </div>
  )
}
