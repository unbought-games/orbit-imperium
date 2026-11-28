import { LockKeyhole } from 'lucide-react'
import { Tooltip } from '@base-ui/react/tooltip'
import { Popover } from '../../ui/popover'
import { DyeTooltip, DyeUnlockDetails } from './dye-tooltip'
import { useState, useId } from 'react'
import { SegmentedControl } from '../../ui/segmented-control'
import { groupDyesByPalette } from './model'
import type {
  ShipDye,
  ShipPaintRecipe,
  ShipSkin,
} from '../../client-model/ship-appearance-types'
import { Field, Select } from '../../ui/form'
import styles from './ship-customizer.module.css'

const paintChannels = [
  { value: 'primary', label: 'Primary' },
  { value: 'accent', label: 'Accent' },
] as const

function PaletteSwatch({
  dye,
  channel,
  selected,
  onChange,
  tooltip,
  tooltipId,
  guideHref,
}: {
  tooltip: Tooltip.Handle<ShipDye>
  tooltipId: string
  guideHref: string
  dye: ShipDye
  channel: string
  selected: boolean
  onChange: (id: string) => void
}) {
  const id = useId()
  if (dye.availability !== 'available') {
    return (
      <Popover
        label={dye.name}
        placement="top"
        className={styles.dye}
        surfaceClassName={styles.dyeDetails}
        button={
          <button
            type="button"
            aria-label={`${channel}: ${dye.name} (${dye.availability})`}
            aria-pressed={selected}
            style={{ backgroundColor: dye.color }}
          />
        }
        trigger={
          <>
            <span className={styles.dyeGlow} aria-hidden="true" />
            <LockKeyhole size={12} aria-hidden="true" />
          </>
        }
      >
        <DyeUnlockDetails dye={dye} guideHref={guideHref} />
      </Popover>
    )
  }
  return (
    <Tooltip.Trigger
      id={id}
      handle={tooltip}
      payload={dye}
      render={(props, state) => (
        <button
          {...props}
          aria-describedby={state.open ? tooltipId : undefined}
        />
      )}
      delay={200}
      type="button"
      className={styles.dye}
      style={{ backgroundColor: dye.color }}
      aria-label={`${channel}: ${dye.name}`}
      aria-pressed={selected}
      onClick={() => onChange(dye.id)}
    >
      <span className={styles.dyeGlow} aria-hidden="true" />
    </Tooltip.Trigger>
  )
}

export function PaintControls({
  recipe,
  guideHref,
  skins,
  dyes,
  disabled,
  onChange,
}: {
  recipe: ShipPaintRecipe
  guideHref: string
  skins: ShipSkin[]
  dyes: ShipDye[]
  disabled: boolean
  onChange: (recipe: ShipPaintRecipe) => void
}) {
  const tooltipId = useId()
  const [tooltip] = useState(() => Tooltip.createHandle<ShipDye>())
  const [channel, setChannel] = useState<'primary' | 'accent'>('primary')
  const channelLabel = channel === 'primary' ? 'Primary' : 'Accent'
  const selectedDye = dyes.find((dye) => dye.id === recipe[channel])
  const selectedSkin = skins.find(
    (skin) =>
      skin.id === recipe.skin_id &&
      skin.package_revision === recipe.package_revision,
  )
  return (
    <>
      {(skins.filter((skin) => skin.available).length > 1 ||
        !selectedSkin?.available) && (
        <Field>
          Ship skin
          <Select
            aria-label="Ship skin"
            value={selectedSkin?.id ?? ''}
            disabled={disabled}
            onChange={(event) => {
              const skin = skins.find((item) => item.id === event.target.value)
              if (skin)
                onChange({
                  ...recipe,
                  skin_id: skin.id,
                  package_revision: skin.package_revision,
                })
            }}
          >
            {!selectedSkin && <option value="">Unavailable skin</option>}
            {skins.map((skin) => (
              <option key={skin.id} value={skin.id} disabled={!skin.available}>
                {skin.name}
                {!skin.available ? ' · unavailable' : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className={styles.paintHeader}>
        <SegmentedControl
          label="Paint channel"
          value={channel}
          onChange={setChannel}
          options={paintChannels}
          disabled={disabled}
        />
        <span className={styles.currentDye}>
          {selectedDye && (
            <span style={{ backgroundColor: selectedDye.color }} />
          )}
          {selectedDye?.name ?? 'Unavailable dye'}
        </span>
      </div>
      <div className={styles.paletteShelf}>
        <fieldset
          className={styles.paletteField}
          disabled={disabled}
          aria-label={`${channelLabel} paint palettes`}
        >
          <div className={styles.palettes}>
            {groupDyesByPalette(dyes).map((palette) => (
              <fieldset
                key={palette.id ?? ''}
                className={styles.palette}
                data-wide={palette.dyes.length > 4 || undefined}
              >
                <legend>{palette.title}</legend>
                <div className={styles.swatches}>
                  {palette.dyes.map((dye) => (
                    <PaletteSwatch
                      key={dye.id}
                      guideHref={guideHref}
                      tooltip={tooltip}
                      tooltipId={tooltipId}
                      dye={dye}
                      channel={channelLabel}
                      selected={recipe[channel] === dye.id}
                      onChange={(id) => onChange({ ...recipe, [channel]: id })}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </fieldset>
      </div>
      <DyeTooltip handle={tooltip} id={tooltipId} />
    </>
  )
}
