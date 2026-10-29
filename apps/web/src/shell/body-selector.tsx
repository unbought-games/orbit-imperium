import type { BoundView } from '../client-model/commands'
import { RichSelect } from '../ui/rich-select'
import { bodyName, coordinates } from '../ui/format'
import { resolveBodyArt } from '../ui/artwork'
import styles from './body-selector.module.css'

function BodyLabel({ body }: { body: BoundView['bodies'][number] }) {
  return (
    <span
      className={styles.body}
      title={`${bodyName(body)} ${coordinates(body)}`}
    >
      <img
        key={body.id}
        src={resolveBodyArt(body).thumbnail}
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
      </span>
    </span>
  )
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
      options={bodies.map((entry) => ({
        value: entry.id,
        label: `${bodyName(entry)} ${coordinates(entry)}`,
        content: <BodyLabel body={entry} />,
      }))}
      onValueChange={onSelect}
    >
      {body ? <BodyLabel body={body} /> : 'Choose a planet'}
    </RichSelect>
  )
}
