import type { components } from '../../contracts'
type S = components['schemas']
export type VisualIdentity = S['AllianceVisualIdentity']
export type Presentation = S['AlliancePresentation']
export type Placement = S['MediaPlacement']
export type TemplateDocument = S['AllianceTemplateDocument']
export type PublicAlliance = S['PublicAlliance']
export type PresentationDraft = {
  revision?: number
  identity?: VisualIdentity
  hall?: S['AllianceHall']
  active_template?: string
  templates: Record<string, TemplateDocument>
}
export function editPresentationDraft(
  saved: Presentation,
  old: PresentationDraft,
  patch: Partial<PresentationDraft>,
  revision: number,
): PresentationDraft {
  const next = { ...old, ...patch }
  const equal = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b)
  if (equal(next.identity, saved.identity)) delete next.identity
  if (equal(next.hall, saved.hall)) delete next.hall
  if (next.active_template === saved.active_template)
    delete next.active_template
  next.templates = Object.fromEntries(
    Object.entries(next.templates).filter(
      ([id, doc]) =>
        !equal(doc, saved.templates[id] ?? { schema_version: 1, content: {} }),
    ),
  )
  const changed =
    next.identity ||
    next.hall ||
    next.active_template ||
    Object.keys(next.templates).length
  next.revision = changed ? (old.revision ?? revision) : undefined
  return next
}
export function mediaUsage(p: Presentation, id: string): string[] {
  const usage: string[] = []
  if (p.identity.crest.kind === 'upload' && p.identity.crest.media_id === id)
    usage.push('Alliance crest')
  if (p.identity.banner?.media_id === id) usage.push('Shared banner')
  if (p.hall.background?.media_id === id) usage.push('Hall background')
  for (const [name, doc] of Object.entries(p.templates)) {
    if (
      templatePlacement(doc.content.hero_media)?.media_id === id ||
      templateGallery(doc.content).some((m) => m.media_id === id)
    )
      usage.push(`${name} template`)
  }
  return usage
}
export function editorMediaUsage(
  saved: Presentation,
  draft: Presentation,
  id: string,
): string[] {
  const persisted = mediaUsage(saved, id)
  return [
    ...persisted,
    ...mediaUsage(draft, id)
      .filter((usage) => !persisted.includes(usage))
      .map((usage) => `${usage} (unsaved)`),
  ]
}
export const defaultIdentity: VisualIdentity = {
  motto: '',
  primary: '#cbb68d',
  secondary: '#a4dbef',
  crest: {
    kind: 'composition',
    recipe: {
      version: 1,
      symbol: 'compass',
      foreground: '#cbb68d',
      background: '#152b40',
    },
  },
  banner: null,
}
export function defaultPresentation(): Presentation {
  return {
    schema_version: 1,
    identity: defaultIdentity,
    hall: { welcome_markdown: '', community_markdown: '', background: null },
    active_template: 'flagship',
    templates: {},
  }
}
export function mediaPath(
  universe: string,
  id: string,
  still = false,
  size?: number,
) {
  const q = new URLSearchParams()
  if (still) q.set('still', 'true')
  if (size) q.set('size', String(size))
  return `/api/v4/universes/${encodeURIComponent(universe)}/alliance-media/${encodeURIComponent(id)}${q.size ? '?' + q : ''}`
}
export function imagePlacement(id: string): Placement {
  return { media_id: id, x: 50, y: 50, mobile_x: null, mobile_y: null, alt: '' }
}
export function templateText(
  content: TemplateDocument['content'],
  key: string,
  fallback = '',
): string {
  const value = content[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}
export function templatePlacement(value: unknown): Placement | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('media_id' in value) ||
    typeof value.media_id !== 'string' ||
    !('x' in value) ||
    !('y' in value)
  )
    return null
  return value as Placement
}
export function templateGallery(
  content: TemplateDocument['content'],
): Placement[] {
  return Array.isArray(content.gallery)
    ? content.gallery.flatMap((v) => {
        const p = templatePlacement(v)
        return p ? [p] : []
      })
    : []
}
export function templateSections(
  content: TemplateDocument['content'],
): { heading: string; markdown: string }[] {
  return Array.isArray(content.sections)
    ? content.sections.flatMap((v) =>
        v &&
        typeof v === 'object' &&
        'heading' in v &&
        'markdown' in v &&
        typeof v.heading === 'string' &&
        typeof v.markdown === 'string'
          ? [{ heading: v.heading, markdown: v.markdown }]
          : [],
      )
    : []
}
export function publicWithDraft(
  data: PublicAlliance,
  draft: Presentation,
): PublicAlliance {
  return {
    ...data,
    summary: { ...data.summary, visual_identity: draft.identity },
    presentation: {
      schema_version: 1,
      identity: draft.identity,
      template_id: draft.active_template,
      document: draft.templates[draft.active_template] ?? {
        schema_version: 1,
        content: {},
      },
    },
  }
}
