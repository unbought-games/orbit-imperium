/** Text glyph positions reveal baseline shifts and accidental line-box inflation.
 * Inspect Latin glyphs at the container's font size; smaller metadata and glyphs
 * from fallback scripts have different ink metrics and are intentionally excluded. */
export function textLineMetrics(element: Element) {
  const style = getComputedStyle(element)
  const tops: number[] = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (getComputedStyle(node.parentElement!).fontSize !== style.fontSize)
      continue
    const text = node.textContent ?? ''
    for (let i = 0; i < text.length; i++) {
      if (!/[A-Za-z]/.test(text[i])) continue
      const range = document.createRange()
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      tops.push(range.getBoundingClientRect().top)
    }
  }
  return {
    lineHeight: parseFloat(style.lineHeight),
    tops: [...new Set(tops)].sort((a, b) => a - b),
  }
}
/** A zero-size inline box's bottom sits precisely on the text baseline. */
export function inlineBaseline(element: Element) {
  const probe = document.createElement('span')
  probe.style.cssText =
    'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline'
  element.prepend(probe)
  const baseline = probe.getBoundingClientRect().bottom
  probe.remove()
  return baseline
}
