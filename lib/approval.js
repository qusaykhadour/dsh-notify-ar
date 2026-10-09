/**
 * dsh-notify-ar — the permission buttons.
 *
 * This is the headline feature: when the agent asks to run something that needs
 * approval, the user answers from the toast instead of switching back to the
 * app. The agent keeps working either way — it is only ever waiting on this
 * decision, never blocked by the notification.
 *
 * How it plugs in
 * ---------------
 * `@deepseek-ai/dsh-user-approval` resolves each request through a Cordis
 * waterfall named `approval/request`. Listeners are answerers: return one of
 * `'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`, or call `next()`
 * to defer to whoever is behind you. `'allowed-once'` is the only grant.
 *
 * Two rules shape the design:
 *
 *   1. **Never block the app.** If anything is uncertain — no toast shown, no
 *      answer in time, an error — we call `next()` so the in-app prompt still
 *      appears. The user must always have a way to decide.
 *   2. **Fail closed on our own errors.** Returning `'unavailable'` makes the
 *      service deny the action, which is the safe direction. That is why the
 *      decorative listeners below are wrapped: a throw must not become a grant.
 *
 * A permission request can arrive mid-turn, so a toast here is genuinely
 * useful: the user is free to walk away and still unblock the agent.
 *
 * @module dsh-notify-ar/approval
 */

/** The only value that grants. Anything else denies or defers. */
export const GRANT = 'allowed-once'
export const REJECT = 'rejected'

/**
 * Ask the user through a toast.
 *
 * @param params.request - The approval request from the waterfall: it carries
 *   `agent`, `toolName`, `callId`, `reason`, and a live `signal`.
 * @param params.show - Callback that displays the toast and returns a promise
 *   resolving to the user's answer. It must resolve to `null` when the user did
 *   not answer (timeout, no toast, dismissal), never a bare denial.
 * @param params.timeoutMs - How long to wait before deferring to the app.
 * @param params.locale - Resolved locale, used to pick a localized label.
 * @param params.log - Optional diagnostics sink.
 * @returns The waterfall outcome.
 */
export async function decideByToast({ request, show, timeoutMs = 120_000, locale, log }) {
  // Respect an already-cancelled request: the turn may have ended while the
  // prompt was being prepared.
  if (request.signal?.aborted) return 'cancelled'

  const tool = describeTool(request, locale)

  // Wrap `show` so a throw is recorded here rather than being flattened into
  // the same `null` that withTimeout returns for "no answer". The two mean
  // different things operationally (a bug in us vs. a user who walked away),
  // and the log is how that gets noticed.
  let failure = null
  const showSafely = async () => {
    try {
      return await show({ request, tool })
    } catch (error) {
      failure = error
      return null
    }
  }

  let answer = null
  try {
    answer = await withTimeout(
      showSafely(),
      timeoutMs,
      request.signal,
    )
  } catch (error) {
    failure = error
    answer = null
  }

  if (failure !== null) {
    // Our failure must not decide the user's fate: hand the prompt back to the
    // app rather than guessing.
    log?.(`approval-show-failed ${String(failure)}`)
    return 'unavailable'
  }

  if (answer === GRANT) return GRANT
  if (answer === REJECT) return REJECT
  if (answer === 'cancelled') return 'cancelled'

  // `null`/`undefined` means "we did not get a decision" — defer so the in-app
  // answerer can still ask.
  log?.(`approval-deferred tool=${tool}`)
  return 'unavailable'
}

/**
 * A short, human label for what is being approved.
 *
 * `displayReason` is NOT always a string. The sandbox escalation path sends a
 * localized map — `{ en: '…', zh: '…' }` — so treating it as text would render
 * `[object Object]` in the toast. This picks the entry matching the user's
 * locale, then English, then any available string.
 *
 * Order of preference overall: the localized display reason, then the logged
 * reason, then the bare tool name. Callers isolate the result for bidi
 * (see `lib/i18n/index.js`).
 *
 * @param request - The approval request.
 * @param locale - The resolved locale, e.g. `'ar'` or `'en'`.
 */
export function describeTool(request, locale) {
  const display = pickLocalized(request.displayReason, locale)
  if (display !== null) return display
  const reason = request.reason
  if (typeof reason === 'string' && reason.trim() !== '') return reason.trim()
  const tool = request.toolName
  return typeof tool === 'string' && tool !== '' ? tool : 'unknown'
}

/**
 * Reduce a `displayReason` to one string.
 *
 * Accepts a plain string, or a locale map. When the map has no entry for the
 * caller's locale it falls back to English and then to the first non-empty
 * string it finds, so a new translation key can never blank out the toast.
 *
 * @returns The chosen text, or `null` when nothing usable is present.
 */
export function pickLocalized(value, locale) {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  if (value === null || typeof value !== 'object') return null

  const candidates = []
  if (typeof locale === 'string' && locale !== '') {
    candidates.push(value[locale])
    // A regional tag such as `ar-SA` should still match an `ar` entry.
    const base = locale.split('-')[0]
    if (base !== locale) candidates.push(value[base])
  }
  candidates.push(value.en, value.ar)

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim()
  }
  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim()
  }
  return null
}

/**
 * Race a promise against a deadline and an abort signal.
 *
 * Resolves to `null` when the deadline passes or the request is cancelled —
 * never rejects — because "no answer" is a normal outcome that must fall back
 * to the in-app prompt.
 *
 * @param promise - The answer promise.
 * @param ms - Deadline in milliseconds.
 * @param signal - Optional AbortSignal from the approval request.
 */
export function withTimeout(promise, ms, signal) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), ms)
    // Deliberately NOT unref'd. An unref'd timer does not hold the event loop
    // open, so in a process with nothing else pending the deadline would never
    // fire and the caller would await a promise that can no longer settle.
    // The timeout is what protects the agent from a hung prompt, so it must be
    // reliable; `finish` clears it as soon as an answer arrives.

    const onAbort = () => finish(null)
    signal?.addEventListener?.('abort', onAbort, { once: true })

    Promise.resolve(promise).then(
      (value) => finish(value),
      () => finish(null),
    )
  })
}
