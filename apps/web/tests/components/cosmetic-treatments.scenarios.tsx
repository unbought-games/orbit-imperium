import { RecognitionMark } from '../../src/features/rewards/recognition'
import { useState } from 'react'
import { TreatmentPreview } from '../../src/features/rewards/cosmetic-treatment'
import type { CosmeticTreatment } from '../../src/adapters/community-rewards'
const families = {
  surface: [
    'satin',
    'brushed',
    'pearl',
    'smoke',
    'frost',
    'enamel',
    'etched',
    'relief',
    'glitter',
    'foil',
    'crosshatch',
    'lenticular',
    'ceramic',
    'hammered',
    'linen',
    'carbon',
    'stipple',
    'patina',
    'mosaic',
    'contour',
    'obsidian',
    'gilded',
    'crystalline',
    'stardust',
  ],
  light: [
    'gleam',
    'rainbow',
    'facets',
    'oil',
    'ripple',
    'confetti',
    'starfield',
    'aurora',
    'constellation',
    'edge',
    'halo',
    'rays',
    'eclipse',
    'comet',
    'pulse',
    'scan',
    'caustic',
    'lightning',
    'corona',
    'supernova',
  ],
  interaction: [
    'tilt',
    'parallax',
    'spotlight',
    'reveal',
    'tap-sweep',
    'focus-trace',
    'bevel',
    'ripple',
    'orbit',
    'prism',
    'lift',
    'magnetic',
    'iris',
    'depth',
    'starburst',
    'portal',
  ],
}
export function CosmeticTreatmentsScenario() {
  const [family, setFamily] = useState<keyof typeof families>('surface')
  return (
    <main style={{ maxWidth: 1200, margin: 'auto', padding: 24 }}>
      <h1>Cosmetic rendering patterns</h1>
      <RecognitionMark
        mark={{
          id: 'sample-duration',
          name: 'Sample support recognition',
          scope: 'account',
          owner_kind: 'account',
          access: 'earned',
          render: { kind: 'support_duration', months: 6 },
        }}
      />
      <label>
        Family{' '}
        <select
          value={family}
          onChange={(e) => setFamily(e.target.value as keyof typeof families)}
        >
          <option value="surface">Surface</option>
          <option value="light">Light</option>
          <option value="interaction">Interaction</option>
        </select>
      </label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))',
          gap: 20,
          marginTop: 24,
        }}
      >
        {families[family].map((pattern) => {
          const treatment: CosmeticTreatment = {
            id: `sample-${family}-${pattern}`,
            name: `Sample ${pattern}`,
            renderer: family,
            family: family === 'surface' ? 'finish' : family,
            scope: 'account',
            access: 'free',
            surfaces: ['emblem'],
            reduced_motion: 'static',
            parameters:
              family === 'interaction'
                ? { pattern, strength: 0.7, depth: 8, duration_ms: 900 }
                : {
                    pattern,
                    strength: 0.7,
                    scale: 8,
                    angle: 40,
                    ...(family === 'light' ? { duration_ms: 3000 } : {}),
                  },
          }
          return (
            <figure
              key={pattern}
              style={{
                margin: 0,
                display: 'grid',
                gap: 12,
                justifyItems: 'center',
                padding: 12,
                border: '1px solid #cbb68d44',
              }}
            >
              <TreatmentPreview
                treatment={{ ...treatment, sample_dye: '#337777' }}
                label={`${pattern} preview`}
              />
              <figcaption>{pattern}</figcaption>
            </figure>
          )
        })}
      </div>
    </main>
  )
}
