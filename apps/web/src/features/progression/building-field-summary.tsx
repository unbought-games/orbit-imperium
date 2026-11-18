import { Grid2X2 } from 'lucide-react'
import { InfoTooltip } from '../../ui/info-tooltip'
import type { ProgressionProps } from './shared'
import styles from './building-field-summary.module.css'

export function BuildingFieldSummary({
  body,
}: {
  body: Pick<
    ProgressionProps['body'],
    'fields_used' | 'fields' | 'fields_reserved'
  >
}) {
  const usage = `${body.fields_used} of ${body.fields} fields used`
  const label =
    body.fields_reserved > 0
      ? `${usage} · ${body.fields_reserved} reserved`
      : usage

  return (
    <InfoTooltip
      label={label}
      description="Fields are building space. Upgrades reserve a field during construction and use it when they finish."
      className={styles.count}
    >
      <Grid2X2 size={16} aria-hidden="true" />
      {`${body.fields_used}/${body.fields}`}
    </InfoTooltip>
  )
}
