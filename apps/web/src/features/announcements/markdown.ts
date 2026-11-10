import MarkdownIt from 'markdown-it'
import { announcementUrl } from './feed'

// Raw HTML is always escaped. The renderer creates markup only from Markdown
// tokens and permits links/images only to root-relative or HTTPS destinations.
const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
})
markdown.validateLink = announcementUrl
const linkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer')
  return linkOpen
    ? linkOpen(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options)
}
export const renderAnnouncementMarkdown = (body: string) =>
  markdown.render(body)
