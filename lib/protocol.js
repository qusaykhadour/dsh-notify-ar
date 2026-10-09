/**
 * dsh-notify-ar — the click protocol (URI shape + single-use nonce).
 *
 * A toast button carries a `dshnar://` URI. When Windows activates it, our
 * `click-gateway.exe` appends the URI to a JSONL file that the host plugin
 * tails. That file is the weak link: any local process can append to it, so a
 * bare URI in the file is an instruction any program could forge.
 *
 * The fix, proven necessary by a live replay during probing, is a **single-use
 * nonce**. The plugin mints a random 128-bit token per toast and keeps it in a
 * pending map. A URI is honoured only when its nonce is present in that map,
 * and the nonce is consumed on first use. So:
 *
 *   - a forged line has no nonce → dropped
 *   - a replayed line has a consumed nonce → dropped
 *   - a stale line (toast already acted on) → dropped
 *
 * The nonce deliberately travels in the URI (not in an env var) because the
 * activation process starts with `cwd=C:\Windows\system32` and no inherited
 * context — the URI is the only channel that survives.
 *
 * @module dsh-notify-ar/protocol
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'

/** The custom URL scheme registered in HKCU by the installer. */
export const SCHEME = 'dshnar'

/** Actions a click may request. Anything else is refused. */
export const ACTIONS = Object.freeze(['approve', 'reject', 'continue', 'stop', 'open'])

/**
 * Build one notification's URI.
 *
 * @param params.action - One of {@link ACTIONS}.
 * @param params.nonce - The single-use token minted for this toast.
 * @param params.session - Target session id (omitted for `open`).
 * @param params.mode - Optional `'steer'` to inject into the running turn.
 * @param params.text - Optional message text (only for `continue`).
 * @returns The `dshnar://…` URI string.
 */
export function buildUri({ action, nonce, session, mode, text }) {
  if (!ACTIONS.includes(action)) throw new Error(`dsh-notify-ar: unknown action "${action}"`)
  const query = new URLSearchParams()
  query.set('action', action)
  query.set('nonce', nonce)
  if (session) query.set('session', session)
  if (mode) query.set('mode', mode)
  if (text) query.set('text', text)
  return `${SCHEME}://click?${query.toString()}`
}

/**
 * Parse an activated URI into a click record.
 *
 * @param uri - The raw `%1` the activation exe received.
 * @returns The parsed record, or `null` when the URI is not ours.
 */
export function parseUri(uri) {
  let url
  try {
    url = new URL(String(uri))
  } catch {
    return null
  }
  if (url.protocol !== `${SCHEME}:`) return null
  const pick = (key) => {
    const value = url.searchParams.get(key)
    return value === null || value === '' ? undefined : value
  }
  const action = pick('action')
  if (!ACTIONS.includes(action)) return null
  return {
    action,
    nonce: pick('nonce'),
    sessionId: pick('session'),
    mode: pick('mode'),
    text: pick('text'),
    rawUri: String(uri),
  }
}

/**
 * Tracks the nonces of toasts we currently have on screen.
 *
 * One instance lives per plugin application. {@link mint} is called when a
 * toast is shown; {@link consume} is called when a click arrives. Consumption
 * is atomic and single-use, which is exactly what makes replay impossible.
 */
export class NonceStore {
  /**
   * @param options.ttlMs - How long a minted nonce stays valid. Defaults to
   *   one hour: long enough for a toast to sit in the Action Center, short
   *   enough that a leaked token does not stay useful all day.
   * @param options.now - Clock injection, for tests.
   */
  constructor({ ttlMs = 60 * 60 * 1000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs
    this.now = now
    /** @type {Map<string, {action: string, sessionId?: string, expiresAt: number}>} */
    this.pending = new Map()
  }

  /**
   * Mint a fresh nonce for a toast that is about to be shown.
   *
   * @param meta.action - The action this toast's button will request.
   * @param meta.sessionId - The session the action applies to.
   * @returns The nonce to embed in the URI.
   */
  mint({ action, sessionId }) {
    this.sweep()
    const nonce = randomBytes(16).toString('hex')
    this.pending.set(nonce, { action, sessionId, expiresAt: this.now() + this.ttlMs })
    return nonce
  }

  /**
   * Consume a nonce. Succeeds at most once per minted token.
   *
   * Constant-time comparison is used against every candidate so the lookup
   * does not leak, through timing, how much of a guessed nonce was correct.
   *
   * @param nonce - The token taken from the clicked URI.
   * @returns The nonce's metadata when it was valid and unused, else `null`.
   */
  consume(nonce) {
    if (typeof nonce !== 'string' || nonce === '') return null
    this.sweep()
    for (const [candidate, meta] of this.pending) {
      if (candidate.length !== nonce.length) continue
      const a = Buffer.from(candidate, 'utf8')
      const b = Buffer.from(nonce, 'utf8')
      if (a.length === b.length && timingSafeEqual(a, b)) {
        this.pending.delete(candidate)
        if (meta.expiresAt <= this.now()) return null
        return meta
      }
    }
    return null
  }

  /** Drop expired nonces so the map cannot grow without bound. */
  sweep() {
    const now = this.now()
    for (const [nonce, meta] of this.pending) {
      if (meta.expiresAt <= now) this.pending.delete(nonce)
    }
  }

  /** How many toasts are currently awaiting a click. */
  get size() {
    return this.pending.size
  }
}
