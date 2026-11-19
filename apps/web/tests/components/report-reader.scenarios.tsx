import type { ReactNode } from 'react'
import { ReportObservation } from '../../src/features/report-observation'
import { ContentColumn } from '../../src/ui/content-column'
import { Section } from '../../src/ui/section'
import shell from '../../src/shell/game-shell.module.css'
import reports from '../../src/features/reports.module.css'
import sharing from '../../src/features/report-sharing.module.css'
import { id } from '../../src/test-support/bootstrap'
import { combatObservation } from '../fixtures/combat-observation'
import {
  longEspionage,
  expandedEspionage,
} from '../../src/test-support/espionage-observation'

// Same sizing ancestors as GameShellFrame → Reports. The route tests own the
// header, current viewer actions and cross-page navigation.
export function ReaderWidth({ children }: { children: ReactNode }) {
  return (
    <div className={shell['game-shell']} data-has-command-hud>
      <div className={shell['shell-columns']}>
        <div className={shell.center}>
          <ContentColumn as="main" className={shell['work-area']}>
            <Section className={reports.screen}>{children}</Section>
          </ContentColumn>
        </div>
      </div>
    </div>
  )
}
export function LargeCombatReader() {
  return (
    <ReaderWidth>
      <ReportObservation
        payload={combatObservation(true)}
        viewer={id(2)}
        playerNames={{ [id(9)]: 'Vega' }}
      />
    </ReaderWidth>
  )
}
export function LongEspionageReader() {
  return (
    <ReaderWidth>
      <ReportObservation payload={longEspionage} />
    </ReaderWidth>
  )
}
export function PublishedEspionageReader() {
  return (
    <main className={sharing.publicPage}>
      <ReportObservation shared payload={expandedEspionage} />
    </main>
  )
}
