import type { ReactNode } from 'react'
import styles from './progression-world.module.css'

export function OrbitDiagram() {
  return (
    <svg
      className={styles.orbits}
      viewBox="0 0 800 500"
      aria-hidden="true"
      fill="none"
    >
      <ellipse cx="400" cy="255" rx="355" ry="130" />
      <ellipse cx="400" cy="255" rx="290" ry="200" strokeDasharray="2 7" />
      <ellipse cx="400" cy="255" rx="215" ry="215" />
      <path d="M400 20v460M35 255h730" strokeDasharray="2 9" />
      <circle cx="185" cy="255" r="5" />
      <circle cx="615" cy="255" r="5" />
    </svg>
  )
}
export function ObjectOrbit({ children }: { children: ReactNode }) {
  return (
    <div className={styles.objectOrbit}>
      <OrbitDiagram />
      {children}
    </div>
  )
}
