import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BoundView } from '../client-model/commands'
import { Button } from '../ui/button'
import { Input, Select } from '../ui/form'
import { bodyName, coordinates } from '../ui/format'
import { resolveBodyArt } from '../ui/artwork'
import { bodyGroups } from './body-selection'
import styles from './body-selector.module.css'
export function BodySelector({
  bodies,
  selected,
  onSelect,
}: {
  bodies: BoundView['bodies']
  selected?: string
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const body = bodies.find((entry) => entry.id === selected)
  const groups = bodyGroups(bodies, query, selected)
  return (
    <div className={styles.selector}>
      {bodies.length > 8 && (
        <Input
          aria-label="Search owned worlds"
          type="search"
          placeholder="Find a planet or moon"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <div className={styles.controls}>
        {body && (
          <img
            key={body.id}
            src={resolveBodyArt(body).thumbnail}
            width={32}
            height={32}
            alt=""
            onError={(event) => {
              event.currentTarget.style.opacity = '0'
            }}
            onLoad={(event) => {
              event.currentTarget.style.opacity = '1'
            }}
          />
        )}
        <div className={styles.selection}>
          <span className={styles.value} aria-hidden="true">
            {body ? (
              <>
                <span className={styles.bodyName}>{bodyName(body)}</span>{' '}
                <span className={styles.bodyCoordinates}>
                  {coordinates(body)}
                </span>
              </>
            ) : (
              'Choose a planet'
            )}
            <ChevronDown
              className={styles.chevron}
              size={16}
              aria-hidden="true"
            />
          </span>
          <Select
            aria-label="Selected body"
            value={selected ?? ''}
            onChange={(event) => {
              onSelect(event.target.value)
              setQuery('')
            }}
          >
            <option value="" disabled>
              Choose a planet
            </option>
            {groups.map((group) => (
              <optgroup key={group.position} label={group.position}>
                {group.entries.map((body) => (
                  <option key={body.id} value={body.id}>
                    {bodyName(body)} {coordinates(body)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        {bodies.length > 1 && (
          <Button
            variant="secondary"
            size="icon"
            className={styles.next}
            aria-label="Next body"
            onClick={() =>
              onSelect(
                bodies[
                  (bodies.findIndex((body) => body.id === selected) + 1) %
                    bodies.length
                ].id,
              )
            }
          >
            <ChevronRight size={20} aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}
