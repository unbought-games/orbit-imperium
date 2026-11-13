import { Fragment, useState } from 'react'
import { Button } from '../ui/button'
import { NumberInput } from '../ui/form'
import { shipGroup, shipGroups } from './ship-order'
import { label } from '../ui/format'
import { formatWholeNumber } from '../ui/whole-number'
import {
  simulationGroupSummary,
  type SimulationField,
} from './combat-simulation-model'
import styles from './combat-simulation.module.css'

type Props = {
  fields: SimulationField[]
  edits: Record<string, string>
  edit: (values: Record<string, string>) => void
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

function FieldGroup({ fields, edits, edit, group }: Props & { group: string }) {
  const defender = fields[0].side === 'defender'
  const collapsible = defender && group !== 'Technologies'
  const [expanded, setExpanded] = useState(
    !fields.every((f) => f.source === 'Report' && f.value !== null),
  )
  const summary = simulationGroupSummary(fields, edits)
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
        {group.name && <h4 className={styles.shipSubtype}>{group.name}</h4>}
        {group.fields.map((field) => (
          <SimulationFieldInput
            key={field.key}
            field={field}
            edits={edits}
            edit={edit}
          />
        ))}
      </Fragment>
    ))
  return (
    <section
      aria-label={`${defender ? 'Defender' : 'Attacker'} ${group.toLowerCase()}`}
    >
      {collapsible ? (
        <details
          open={expanded}
          onToggle={(event) => setExpanded(event.currentTarget.open)}
          className={styles.fieldGroup}
        >
          <summary className={styles.groupHeading}>
            {group}
            <span className={styles.groupSummary}>
              {formatWholeNumber(summary.total)} units · {summary.types}{' '}
              {summary.types === 1 ? 'type' : 'types'}
              {summary.unknown > 0 && (
                <span> · {summary.unknown} not observed; assumed zero</span>
              )}
              {summary.invalid > 0 && (
                <strong role="alert">
                  {' '}
                  · {summary.invalid} invalid values — expand to edit
                </strong>
              )}
            </span>
          </summary>
          {contents}
        </details>
      ) : (
        <>
          <h3 className={styles.groupHeading}>{group}</h3>
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
}: Omit<Props, 'fields'> & { field: SimulationField }) {
  const value = edits[field.key] ?? field.value ?? '0'
  const invalid =
    !/^(0|[1-9][0-9]*)$/.test(value || '0') ||
    Number(value) > (field.item ? 2000 : 100)
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
  return (
    <div
      className={`${styles.field} ${value && value !== '0' ? styles.nonzero : ''}`}
    >
      <div>
        <label htmlFor={`simulation-${field.key}`} title={source}>
          {label(field.label)}
        </label>
        {field.available !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="small"
            className={styles.available}
            aria-label={`Use all ${formatWholeNumber(field.available)} available ${label(field.label)}`}
            title={`${source}. Fill with ships stationed at this origin`}
            onClick={() => edit({ [field.key]: field.available! })}
          >
            {formatWholeNumber(field.available)} available
          </Button>
        ) : (
          source && <small>{source}</small>
        )}
      </div>
      <NumberInput
        id={`simulation-${field.key}`}
        aria-label={`${field.side === 'attacker' ? 'Attacker' : 'Defender'} ${label(field.label)}`}
        aria-invalid={invalid || undefined}
        value={value}
        placeholder="0"
        onChange={(event) => edit({ [field.key]: event.target.value })}
      />
    </div>
  )
}
