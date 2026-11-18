import type { ProgressionProps } from './shared'

export function buildingFieldSummary(
  body: Pick<
    ProgressionProps['body'],
    'fields_used' | 'fields' | 'fields_reserved'
  >,
) {
  const usage = `${body.fields_used} of ${body.fields} fields used`
  return body.fields_reserved > 0
    ? `${usage} · ${body.fields_reserved} reserved`
    : usage
}
