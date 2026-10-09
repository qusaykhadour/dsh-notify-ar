/**
 * dsh-notify-ar — the click reader.
 *
 * Tails the JSONL bridge file that `click-gateway.exe` appends to and turns
 * each complete line into an action. Three design points matter:
 *
 *   - **Only complete lines are consumed.** The gateway writes one line per
 *     click; reading a half-written line would produce a phantom click. The
 *     reader advances its offset only past the last newline it saw.
 *   - **A truncated file rewinds.** If the file shrinks (the user cleared it,
 *     or a tool rewrote it), the offset is reset. This is exactly the case a
 *     probe caught turning into a replay storm, which is why the nonce check
 *     in `./protocol.js` is what actually authorises a click.
 *   - **Every line is untrusted.** A line is honoured only when it parses, its
 *     action is in the allow-list, and its single-use nonce is still pending.
 *
 * @module dsh-notify-ar/reader
 */
import { readFileSync, statSync } from 'node:fs'
import { parseUri } from './protocol.js'

/** How often the bridge file is polled. Clicks are human-paced; this is plenty. */
export const POLL_MS = 300

/**
 * Watch a JSONL bridge file for clicks.
 *
 * @param params.path - Absolute path of the file the gateway appends to.
 * @param params.onClick - Called with each verified click record.
 * @param params.onReject - Called with `(reason, detail)` for refused lines.
 * @param params.verify - Predicate/nonce check: returns truthy to accept a click.
 * @param params.pollMs - Override for the poll interval (tests).
 * @returns A `stop()` function that ends the watch.
 */
export function watchClicks({ path, onClick, onReject, verify, pollMs = POLL_MS }) {
  // Start at the current end: a plugin restart must not replay history.
  let offset = 0
  try {
    offset = statSync(path).size
  } catch {
    offset = 0
  }

  // Serialise handling so two clicks cannot interleave their async work.
  let queue = Promise.resolve()

  const poll = () => {
    let size
    try {
      size = statSync(path).size
    } catch {
      return // no file yet
    }

    if (size < offset) {
      // The file shrank. Rewind to the beginning and let the nonce check
      // decide what, if anything, is still legitimate.
      offset = 0
    }
    if (size === offset) return

    let buffer
    try {
      buffer = readFileSync(path)
    } catch {
      return
    }

    const chunk = buffer.subarray(offset).toString('utf8')
    const lastNewline = chunk.lastIndexOf('\n')
    if (lastNewline === -1) return // the writer is mid-line; wait for the newline

    const complete = chunk.slice(0, lastNewline)
    offset += Buffer.byteLength(complete, 'utf8') + 1

    for (const rawLine of complete.split('\n')) {
      const line = rawLine.trim()
      if (line === '') continue

      let uri
      try {
        const outer = JSON.parse(line)
        uri = typeof outer.arg === 'string' ? outer.arg : ''
      } catch {
        onReject?.('malformed-line', line.slice(0, 200))
        continue
      }
      if (uri === '') {
        onReject?.('empty-arg', line.slice(0, 200))
        continue
      }

      const record = parseUri(uri)
      if (record === null) {
        onReject?.('unparsable-uri', uri.slice(0, 200))
        continue
      }

      // The authorisation step: unknown, forged, expired, or already-used
      // nonces are refused here and never reach the click handler.
      const granted = verify ? verify(record) : true
      if (!granted) {
        onReject?.('nonce-rejected', uri.slice(0, 200))
        continue
      }

      queue = queue.then(() => onClick(record)).catch((error) => {
        onReject?.('handler-failed', String(error))
      })
    }
  }

  const timer = setInterval(poll, pollMs)
  if (typeof timer.unref === 'function') timer.unref()

  return function stop() {
    clearInterval(timer)
  }
}
