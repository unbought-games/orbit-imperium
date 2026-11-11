import MarkdownIt from 'markdown-it'
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
}).disable('image')
markdown.validateLink = (url: string) =>
  /^(https?:\/\/|mailto:|\/[^/]|#)/i.test(url)
const originalLink = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const href = tokens[index].attrGet('href') ?? ''
  if (/^https?:\/\//i.test(href)) {
    tokens[index].attrSet('target', '_blank')
    tokens[index].attrSet('rel', 'noopener noreferrer')
  }
  return originalLink
    ? originalLink(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options)
}
export function allianceMarkdown(source: string): string {
  return markdown.render(source)
}
