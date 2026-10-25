import MarkdownIt from 'markdown-it'
const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: true,
}).disable('image')
markdown.validateLink = (url: string) =>
  /^(https?:\/\/|mailto:|\/[^/]|#)/i.test(url)
export function allianceMarkdown(source: string): string {
  return markdown.render(source)
}
