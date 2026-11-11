import { useState } from 'react'
import { Button } from '../../src/ui/button'
import { Field, Select } from '../../src/ui/form'
import { PublicAllianceTemplate } from '../../src/features/alliances/public-template'
import { PresentationPreview } from '../../src/features/alliances/presentation-preview'
import {
  defaultPresentation,
  imagePlacement,
  publicWithDraft,
} from '../../src/features/alliances/presentation-model'

export function AlliancePresentationStory() {
  const [template, setTemplate] = useState('flagship'),
    [text, setText] = useState('A place to make your own.'),
    [preview, setPreview] = useState(false)
  const draft = defaultPresentation()
  draft.identity = {
    ...draft.identity,
    motto: 'Good company. Uncharted space.',
    crest: {
      kind: 'composition',
      recipe: {
        version: 2,
        symbol: 'compass',
        foreground: '#cbb68d',
        background: '#152b40',
        layers: [],
        shape: 'shield',
      },
    },
  }
  draft.active_template = template
  draft.templates = {
    flagship: {
      schema_version: 1,
      content: {
        hero_markdown: text,
        community_markdown: 'Say hello at https://example.com/community',
      },
    },
    transmission: {
      schema_version: 1,
      content: {
        letter_heading: 'You don’t have to explore alone.',
        letter_markdown: text,
      },
    },
    citadel: {
      schema_version: 1,
      content: {
        hero_heading: 'Many worlds. One home.',
        hero_markdown: text,
        gallery: [1, 2, 3].map((n) => ({
          ...imagePlacement(`00000000-0000-4000-8000-00000000000${n}`),
          alt: `Gallery image ${n}`,
        })),
      },
    },
  }
  const data = publicWithDraft(
    {
      summary: {
        id: '00000000-0000-4000-8000-000000000010',
        universe: '00000000-0000-4000-8000-000000000020',
        name: 'The Astral Veil',
        tag: 'VEIL',
        recruitment: 'Application',
        member_count: 24,
      },
      public_text: 'We build and explore together.',
      universe_name: 'Asterion',
    },
    draft,
  )
  return (
    <>
      <div style={{ padding: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Field>
          Template
          <Select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            {['flagship', 'transmission', 'citadel'].map((id) => (
              <option key={id}>{id}</option>
            ))}
          </Select>
        </Field>
        <Field>
          Invitation draft
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button onClick={() => setPreview(true)}>Preview</Button>
      </div>
      <PublicAllianceTemplate
        data={data}
        action={<Button>Apply to the Veil</Button>}
      />
      <PresentationPreview open={preview} onClose={() => setPreview(false)}>
        <PublicAllianceTemplate
          data={data}
          preview
          action={<Button disabled>Apply to the Veil</Button>}
        />
      </PresentationPreview>
    </>
  )
}
