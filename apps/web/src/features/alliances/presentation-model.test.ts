import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PublicAllianceTemplate } from './public-template'
import {
  defaultPresentation,
  editPresentationDraft,
  mediaUsage,
  imagePlacement,
  mediaPath,
  publicWithDraft,
} from './presentation-model'

it('public projection selects one template and excludes private Hall and inactive copy', () => {
  const draft = defaultPresentation()
  draft.hall.welcome_markdown = 'Private rendezvous'
  draft.templates.flagship = {
    schema_version: 1,
    content: { hero_markdown: 'Published invitation' },
  }
  draft.templates.transmission = {
    schema_version: 1,
    content: { letter_markdown: 'Inactive draft' },
  }
  const data = publicWithDraft(
    {
      summary: {
        id: 'a',
        universe: 'u',
        name: 'Veil',
        tag: 'VEIL',
        member_count: 2,
        recruitment: 'Application',
      },
      public_text: 'Public introduction',
    },
    draft,
  )
  const serialized = JSON.stringify(data)
  expect(serialized).toContain('Published invitation')
  expect(serialized).not.toContain('Private rendezvous')
  expect(serialized).not.toContain('Inactive draft')
  expect(draft.templates.transmission.content.letter_markdown).toBe(
    'Inactive draft',
  )
})

it.each(['flagship', 'transmission', 'citadel'])(
  '%s renders authored copy, admission action and game introduction',
  (template) => {
    const draft = defaultPresentation()
    draft.active_template = template
    draft.templates[template] = {
      schema_version: 1,
      content: {
        hero_markdown: 'A place to make your own.',
        letter_markdown: 'A place to make your own.',
        gallery: [1, 2, 3].map((n) => ({
          ...imagePlacement(`media-${n}`),
          alt: `Gallery image ${n}`,
        })),
      },
    }
    const data = publicWithDraft(
      {
        summary: {
          id: 'a',
          universe: 'u',
          name: 'Veil',
          tag: 'VEIL',
          member_count: 2,
          recruitment: 'Application',
        },
        public_text: 'Public introduction',
      },
      draft,
    )
    const html = renderToStaticMarkup(
      createElement(PublicAllianceTemplate, {
        data,
        action: createElement('button', null, 'Apply to the Veil'),
      }),
    )
    expect(html).toContain('A place to make your own.')
    expect(html).toContain('Apply to the Veil')
    expect(html).toContain('free browser strategy game')
    expect(html).toContain('Approval is required')
    if (template === 'citadel')
      for (const n of [1, 2, 3])
        expect(html).toContain(`alt="Gallery image ${n}"`)
  },
)

it('media URLs are local and still renditions are explicit', () => {
  expect(mediaPath('world', 'image', true, 256)).toBe(
    '/api/v4/universes/world/alliance-media/image?still=true&size=256',
  )
  expect(mediaPath('world', 'https://outside.test/image')).toContain(
    'https%3A%2F%2Foutside.test%2Fimage',
  )
})

it('reverting template selection clears the pending edit without losing other template edits', () => {
  const saved = defaultPresentation()
  const changed = editPresentationDraft(
    saved,
    { templates: {} },
    { active_template: 'citadel' },
    7,
  )
  expect(changed.revision).toBe(7)
  const reverted = editPresentationDraft(
    saved,
    changed,
    { active_template: 'flagship' },
    8,
  )
  expect(reverted.revision).toBeUndefined()
  const letter = {
    schema_version: 1,
    content: { letter_markdown: 'A private draft' },
  }
  const edited = editPresentationDraft(
    saved,
    changed,
    { active_template: 'flagship', templates: { transmission: letter } },
    8,
  )
  expect(edited.revision).toBe(7)
  expect(edited.templates.transmission).toEqual(letter)
})
it('media usage includes retained inactive templates and private Hall references', () => {
  const p = defaultPresentation()
  p.hall.background = imagePlacement('image')
  p.templates.transmission = {
    schema_version: 1,
    content: { hero_media: imagePlacement('image') },
  }
  expect(mediaUsage(p, 'image')).toEqual([
    'Hall background',
    'transmission template',
  ])
})
