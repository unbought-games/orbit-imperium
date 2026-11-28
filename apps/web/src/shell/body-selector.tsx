import type { BoundView } from '../client-model/commands'
import { RichSelect } from '../ui/rich-select'
import { bodyName, coordinates } from '../ui/format'
import { resolveBodyArt } from '../ui/artwork'
import { useBodyAppearance } from '../features/body-appearance'
import { groupPickerBodies, type PickerBody } from './body-picker-groups'
import hidden from '../ui/visually-hidden.module.css'
import styles from './body-selector.module.css'

function BodyLabel({
  body,
  parent,
}: {
  body: PickerBody
  parent?: PickerBody
}) {
  const appearance = useBodyAppearance(body.id)
  return (
    <span
      className={styles.body}
      data-nested={parent ? '' : undefined}
      title={pickerLabel(body, parent)}
    >
      <img
        key={body.id}
        src={resolveBodyArt({ ...body, appearance }).thumbnail}
        width={40}
        height={40}
        alt=""
        onError={(event) => {
          event.currentTarget.style.opacity = '0'
        }}
        onLoad={(event) => {
          event.currentTarget.style.opacity = '1'
        }}
      />
      <span className={styles.description}>
        <span className={styles.bodyName}>{bodyName(body)}</span>{' '}
        <span className={styles.bodyCoordinates}>{coordinates(body)}</span>
        {parent && (
          <span className={hidden.hidden}>moon of {bodyName(parent)}</span>
        )}
      </span>
    </span>
  )
}

function pickerLabel(body: PickerBody, parent?: PickerBody) {
  const label = `${bodyName(body)} ${coordinates(body)}`
  return parent ? `${label}, moon of ${bodyName(parent)}` : label
}

function pickerOption(body: PickerBody, parent?: PickerBody) {
  return {
    value: body.id,
    label: pickerLabel(body, parent),
    content: <BodyLabel body={body} parent={parent} />,
  }
}

export function BodySelector({
  bodies,
  selected,
  onSelect,
}: {
  bodies: BoundView['bodies']
  selected?: string
  onSelect: (id: string) => void
}) {
  const body = bodies.find((entry) => entry.id === selected)
  return (
    <RichSelect
      label="Selected body"
      value={body?.id}
      className={styles.selector}
      options={groupPickerBodies(bodies).flatMap(({ body, moons }) => [
        pickerOption(body),
        ...moons.map((moon) => pickerOption(moon, body)),
      ])}
      onValueChange={onSelect}
    >
      {body ? <BodyLabel body={body} /> : 'Choose a planet'}
    </RichSelect>
  )
}
