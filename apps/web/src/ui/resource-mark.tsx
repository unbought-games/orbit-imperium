import type { ComponentProps } from 'react'
const colors = {
  metal: 'var(--resource-metal)',
  crystal: 'var(--resource-crystal)',
  deuterium: 'var(--resource-deuterium)',
  energy: 'var(--ice)',
}
/** Resource identity owns its color everywhere; callers provide sizing and accessible names. */
export function ResourceMark({
  resource,
  style,
  ...props
}: ComponentProps<'svg'> & {
  resource: 'metal' | 'crystal' | 'deuterium' | 'energy'
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
      data-resource={resource}
      style={{ ...style, color: colors[resource] }}
    >
      {resource === 'metal' && (
        <>
          <path d="m3 29 6-14 10-6 12 3 6 15-9 6-13-1Z" />
          <path d="m9 15 10 3 12-6M3 29l12-6 4-14M15 23l4-5 9 15M19 18l8 5 10 4M9 15l6 17M27 23l4-11M3 29l12 3" />
        </>
      )}
      {resource === 'crystal' && (
        <>
          <path d="m19 3-6 10 2 20 7 4 6-15-3-12ZM19 3l3 34M13 13l9 5 3-8M22 18l6 4" />
          <path d="m13 18-7-5-1 12 10 8M6 13l4 14 5 6M28 22l7-7 1 13-14 9M35 15l-5 15-8 7" />
        </>
      )}
      {resource === 'deuterium' && (
        <>
          <path d="m17 9-9 19m15-19 9 19M11 32h18" />
          <circle cx="20" cy="7" r="4" />
          <circle cx="7" cy="32" r="4" />
          <circle cx="33" cy="32" r="4" />
        </>
      )}
      {resource === 'energy' && (
        <path
          d="m25 2-16 22h11l-5 14 17-23H21Z"
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  )
}
