import { afterEach, expect, it, vi } from 'vitest'
import { copyReportLink } from './copy-report-link'

afterEach(() => vi.unstubAllGlobals())
function fixture(writeText?: (text: string) => Promise<void>, legacy = false) {
  vi.stubGlobal('navigator', {
    clipboard: writeText ? { writeText } : undefined,
  })
  const execCommand = vi.fn(() => legacy)
  vi.stubGlobal('document', { execCommand })
  const input = {
    value: 'https://example.com/reports/shared/token',
    isConnected: true,
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
  }
  return {
    input,
    execCommand,
    copy: () => copyReportLink(input as unknown as HTMLInputElement),
  }
}
it('writes immediately in the click gesture without an earlier asynchronous boundary', async () => {
  const write = vi.fn(async () => {})
  const f = fixture(write)
  const pending = f.copy()
  expect(write).toHaveBeenCalledWith(f.input.value)
  expect(await pending).toBe(true)
  expect(f.execCommand).not.toHaveBeenCalled()
})
it.each(['absent', 'rejected'])(
  'uses a selected visible input when the clipboard API is %s',
  async (mode) => {
    const f = fixture(
      mode === 'rejected'
        ? async () => {
            throw Error('denied')
          }
        : undefined,
      true,
    )
    expect(await f.copy()).toBe(true)
    expect(f.input.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(f.input.setSelectionRange).toHaveBeenCalledWith(
      0,
      f.input.value.length,
    )
    expect(f.execCommand).toHaveBeenCalledWith('copy')
  },
)
it('keeps the link selected for manual copy and never reports success if both APIs fail', async () => {
  const f = fixture()
  f.execCommand.mockImplementation(() => {
    throw Error('unsupported')
  })
  expect(await f.copy()).toBe(false)
  expect(f.input.select).toHaveBeenCalled()
})
it('does not try to select an input after the sharing dialog closes', async () => {
  const f = fixture(async () => {
    f.input.isConnected = false
    throw Error('denied')
  })
  expect(await f.copy()).toBe(false)
  expect(f.input.focus).not.toHaveBeenCalled()
  expect(f.execCommand).not.toHaveBeenCalled()
})
