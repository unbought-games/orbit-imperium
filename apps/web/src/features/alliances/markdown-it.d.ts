declare module 'markdown-it' {
  export default class MarkdownIt {
    constructor(options?: {
      html?: boolean
      linkify?: boolean
      typographer?: boolean
      breaks?: boolean
    })
    disable(rules: string | string[]): this
    render(source: string): string
    validateLink(url: string): boolean
  }
}
