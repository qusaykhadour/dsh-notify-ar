/**
 * dsh-notify-ar — actionable Arabic-first notifications for DeepSeek Harness.
 *
 * The plugin watches the agent and, when something needs the user, shows a
 * Windows toast that carries a real button. Pressing it acts on the session
 * directly, so the user never has to come back to the window:
 *
 *   - `continue` → `sessionController.prompt(...)` to nudge the agent onward
 *   - `stop`     → `sessionController.cancel({ sessionId })` to end the turn
 *   - `open`     → bring the DSH window forward
 *
 * The heavy lifting lives in `./toast.js` (build + show), `./reader.js` (read
 * clicks) and `./protocol.js` (URI shape + nonce authorisation). This module is
 * the wiring: config, event subscription, and action dispatch.
 *
 * @module dsh-notify-ar
 */
import { join } from 'node:path'
import { existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { buildToastXml, showToast } from './toast.js'
import { watchClicks } from './reader.js'
import { NonceStore, buildUri, SCHEME } from './protocol.js'
import { resolveLocale, translator, bidi } from './i18n/index.js'
import { decideByToast, GRANT, REJECT } from './approval.js'

export const name = 'dsh-plugin-notify-ar'

/**
 * Services we borrow. `sessionController` is required for the action buttons;
 * without it the plugin degrades to plain notifications and says so.
 */
export const inject = ['sessionController']

/** Where the bridge file and compiled gateway live. */
export function dataDir(env = process.env) {
  const local = env.LOCALAPPDATA
  if (local) return join(local, 'dsh-notify-ar')
  return join(env.USERPROFILE || '.', 'AppData', 'Local', 'dsh-notify-ar')
}

const DEFAULT_CONFIG = {
  /** Master switch. */
  enabled: true,
  /** `'auto'` follows the app's language; or force `'ar'` / `'en'`. */
  locale: 'auto',
  /** Only notify for the user's own sessions, not subagents. */
  rootsOnly: true,
  /** Per-kind switches. */
  notifyFinished: true,
  notifyAborted: true,
  notifyError: true,
  notifyWaiting: true,
  notifyDisposed: true,
  /** Offer a permission toast with an Allow button (the headline feature). */
  notifyApproval: true,
  /**
   * How long a permission toast waits for an answer before deferring to the
   * in-app prompt. Long by design: the point is that the user may walk away.
   */
  approvalTimeoutMs: 120000,
  /** Minimum gap between two toasts for the same session (ms). */
  cooldownMs: 10000,
  /** Title prefix. */
  titlePrefix: 'dsh',
  /** AppUserModelId registered by `scripts/setup.mjs`. */
  aumid: 'Qusay.DshNotifyAr',
  /** How long a button stays valid (ms) before it is treated as stale. */
  buttonTtlMs: 60 * 60 * 1000,
  /** Override for powershell.exe. */
  powershellPath: undefined,
  /** Extra diagnostic file; empty disables it. */
  debugLog: '',
}

/** Build the URI for the single button a toast carries. */
function buttonUri(nonces, { action, sessionId, mode, text }) {
  const nonce = nonces.mint({ action, sessionId })
  return buildUri({ action, nonce, session: sessionId, mode, text })
}

/**
 * Apply the plugin.
 *
 * @param ctx - The Cordis context.
 * @param config - Merged plugin config.
 */
export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  if (!cfg.enabled) return

  const t = translator(resolveLocale(cfg))
  const dir = dataDir()
  const bridgePath = join(dir, 'clicks.jsonl')
  const diagPath = cfg.debugLog || join(dir, 'plugin.log')

  try {
    mkdirSync(dir, { recursive: true })
  } catch (error) {
    ctx.logger.warn(`dsh-notify-ar: cannot create ${dir}: ${String(error)}`)
    return
  }

  const diag = (message) => {
    if (!diagPath) return
    try {
      appendFileSync(diagPath, `${new Date().toISOString()}  ${message}\n`, 'utf8')
    } catch {
      // Diagnostics must never break the plugin.
    }
  }

  const nonces = new NonceStore({ ttlMs: cfg.buttonTtlMs })
  const abort = new AbortController()

  // A startup breadcrumb. Without it, a silent plugin and a plugin that simply
  // has not been asked to notify yet look identical in the log.
  diag(
    `loaded locale=${resolveLocale(cfg)} aumid=${cfg.aumid} ` +
      `gateway=${existsSync(join(dir, 'click-gateway.exe')) ? 'ok' : 'MISSING'}`,
  )

  if (!existsSync(join(dir, 'click-gateway.exe'))) {
    ctx.logger.warn(
      'dsh-notify-ar: click-gateway.exe is missing — buttons will not work. ' +
        'Run "node scripts/setup.mjs" and restart DSH.',
    )
    diag('gateway-missing')
  }

  /** Newest session seen in the running state, used when a URI omits one. */
  let lastRunningId = null

  /**
   * Permission requests currently waiting on a toast answer.
   *
   * Keyed by the nonce the toast carries, so a click resolves exactly the
   * request that raised it. Entries are removed by whoever settles first — the
   * click, the deadline, or teardown — so a stale entry cannot decide a later
   * request.
   *
   * @type {Map<string, (answer: string|null) => void>}
   */
  const pendingApprovals = new Map()

  const settleApproval = (nonce, answer) => {
    const resolve = pendingApprovals.get(nonce)
    if (resolve === undefined) return false
    pendingApprovals.delete(nonce)
    resolve(answer)
    return true
  }

  /** Dispatch one verified click. */
  const onClick = async (record) => {
    diag(`click ${record.action} session=${record.sessionId ?? '-'}`)
    try {
      switch (record.action) {
        case 'open': {
          // DSH handles exactly one deep link, `dsh://open`, which focuses the
          // primary window instead of starting a second instance. It has to be
          // launched through the shell so Windows resolves the protocol.
          spawn('cmd.exe', ['/c', 'start', '', 'dsh://open'], {
            windowsHide: true,
            stdio: 'ignore',
            detached: true,
          }).unref()
          return
        }
        case 'continue': {
          const sessionId = record.sessionId ?? lastRunningId
          if (!sessionId) return
          await ctx.sessionController.prompt(
            {
              sessionId,
              requestId: randomUUID(),
              content: [{ type: 'text', text: record.text || 'كمّل' }],
              ...(record.mode === 'steer' ? { mode: 'steer' } : {}),
            },
            abort.signal,
          )
          diag(`continued session=${sessionId}`)
          return
        }
        case 'approve':
        case 'reject': {
          // A permission button. Resolve the waiting request rather than
          // prompting the agent: the approval service owns the outcome.
          const answer = record.action === 'approve' ? GRANT : REJECT
          const settled = settleApproval(record.nonce, answer)
          diag(`${record.action} settled=${settled}`)
          return
        }
        case 'stop': {
          const sessionId = record.sessionId ?? lastRunningId
          if (!sessionId) return
          ctx.sessionController.cancel({ sessionId })
          diag(`stopped session=${sessionId}`)
          return
        }
        default:
          diag(`unhandled action ${record.action}`)
      }
    } catch (error) {
      ctx.logger.warn(`dsh-notify-ar: click action failed: ${String(error)}`)
      diag(`click-failed ${String(error)}`)
    }
  }

  const stopWatching = watchClicks({
    path: bridgePath,
    onClick,
    onReject: (reason, detail) => {
      diag(`reject ${reason} ${detail}`)
    },
    verify: (record) => nonces.consume(record.nonce) !== null,
  })

  /** Per-session cooldown so a flapping agent cannot spam the screen. */
  const lastShown = new Map()
  const cooling = (sessionId) => {
    const previous = lastShown.get(sessionId) ?? 0
    const now = Date.now()
    if (now - previous < cfg.cooldownMs) return true
    lastShown.set(sessionId, now)
    return false
  }

  /**
   * Show one actionable toast.
   *
   * @param kind - Notification kind, also the i18n key stem.
   * @param session - The session the button will act on.
   * @param params.tool - Tool name (approval toasts).
   * @param params.reason - Short reason line (approval toasts).
   * @param params.action - Which action the button performs.
   */
  const notify = (kind, session, { tool, reason, action } = {}) => {
    if (!session || typeof session.id !== 'string') return
    if (cooling(session.id)) return

    const title = `${cfg.titlePrefix} — ${t(`title.${kind}`)}`
    const body = t(`body.${kind}`, {
      tool: tool ? bidi(tool) : '',
      reason: reason ? bidi(reason) : '',
      workspace: bidi(workspaceLabel(session)),
      session: bidi(shortId(session.id)),
    })

    // One button per toast: Windows drops the toast after the first press.
    const chosen = action ?? defaultActionFor(kind)
    const button = chosen
      ? {
          text: t(`button.${chosen}`),
          uri: buttonUri(nonces, {
            action: chosen,
            sessionId: session.id,
            text: chosen === 'continue' ? t('button.continue') : undefined,
          }),
        }
      : undefined

    const xml = buildToastXml({ title, body, button })
    showToast(ctx, { xml, aumid: cfg.aumid, powershellPath: cfg.powershellPath })
    diag(`toast ${kind} action=${chosen ?? 'none'}`)
  }

  const offStatus = ctx.on('agent/status', ({ agent, status }) => {
    diag(`status ${status} session=${agent?.id ?? '-'}`)
    if (status === 'running') {
      lastRunningId = agent.id
      return
    }
    if (status !== 'idle') return
    if (cfg.rootsOnly && isSubagent(ctx, agent)) {
      diag('skip subagent')
      return
    }
    if (!cfg.notifyFinished) return
    notify('finished', agent.session, { action: 'continue' })
  })

  /**
   * The permission-button answerer.
   *
   * Registered on the `approval/request` waterfall. Returning a value answers
   * the request; calling `next()` passes it to the next answerer (the in-app
   * prompt). Every uncertain path calls `next()`, so this plugin can never
   * prevent the user from being asked.
   *
   * The toast shows BOTH choices as two separate toasts when possible; a
   * single toast carries one button because Windows discards a toast after its
   * first press. We therefore offer the *grant* as the toast button and leave
   * denial to the app's own prompt — except when the request may safely wait,
   * in which case the app prompt is the natural place to deny.
   *
   * Registered with `prepend`, which reverses the natural order. The reason is
   * concrete: `@deepseek-ai/dsh-api-remotes` also subscribes to this waterfall
   * so the browser UI can answer, and its listener THROWS a TypeError when a
   * request's agent does not match the scope carrier it is bound to. Cordis
   * contains a throwing listener into a fail-closed `unavailable`, so if that
   * subscriber runs first, the request is already decided as "no channel
   * available" and never reaches us. Running first means we get the chance to
   * answer; we still return `next()` for anything we cannot handle, so the
   * browser keeps working exactly as before.
   */
  const offApproval = ctx.on('approval/request', (request, next) => {
    // Log first, before any filtering: if this line never appears, the request
    // never reached us at all and the cause is listener composition, not config.
    diag(
      `approval-request tool=${request?.toolName ?? '?'} ` +
        `agent=${request?.agent?.id ?? 'none'} enabled=${cfg.notifyApproval}`,
    )
    if (!cfg.notifyApproval) return next()
    if (request?.agent === undefined) return next()
    if (cfg.rootsOnly && isSubagent(ctx, request.agent)) return next()

    const session = request.agent.session

    return decideByToast({
      request,
      timeoutMs: cfg.approvalTimeoutMs,
      locale: resolveLocale(cfg),
      log: diag,
      show: ({ tool: shownTool }) =>
        new Promise((resolve) => {
          // Mint the nonce first, then register the resolver under it, so a
          // click arriving immediately still finds its request.
          const nonce = nonces.mint({
            action: 'approve',
            sessionId: session?.id,
          })
          pendingApprovals.set(nonce, resolve)

          const uri = buildUri({ action: 'approve', nonce, session: session?.id })
          const xml = buildToastXml({
            title: `${cfg.titlePrefix} — ${t('title.approval')}`,
            body: t('body.approval', { tool: bidi(shownTool) }),
            button: { text: t('button.allow'), uri },
          })
          showToast(ctx, { xml, aumid: cfg.aumid, powershellPath: cfg.powershellPath })
          diag(`toast approval tool=${shownTool}`)
        }),
    }).catch((error) => {
      // A throw here would propagate into the approval service. Defer instead:
      // the app's own prompt must remain available.
      diag(`approval-handler-failed ${String(error)}`)
      return 'unavailable'
    })
  }, { prepend: true })

  ctx.effect(() => () => {
    stopWatching()
    offStatus?.()
    offApproval?.()
    // Release anyone still waiting so no promise is left dangling.
    for (const resolve of pendingApprovals.values()) resolve(null)
    pendingApprovals.clear()
    abort.abort()
  })

  // Confirm the answerer actually registered. `ctx.on` can return without
  // throwing even when a subscriber never sees an event, so a positive
  // breadcrumb is the only way to tell "listening" from "silently absent".
  diag(`approval-listener-registered=${typeof offApproval === 'function'}`)
}

/** Short human id for a session, matching the sidebar's habit. */
function shortId(id) {
  const text = String(id ?? '')
  return text.length > 12 ? `${text.slice(0, 12)}…` : text
}

/** Best-effort workspace label: the session's cwd basename. */
function workspaceLabel(session) {
  const cwd = session?.cwd || session?.meta?.cwd
  if (typeof cwd !== 'string' || cwd === '') return ''
  return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
}

/** True when the agent is a subagent rather than the user's own session. */
function isSubagent(ctx, agent) {
  try {
    const snapshot = ctx.sessionProjections?.snapshot?.(agent.session, ['subagent'])
    return snapshot?.values?.subagent !== undefined
  } catch {
    return false
  }
}

/** Which button a notification kind offers by default. */
function defaultActionFor(kind) {
  switch (kind) {
    case 'finished':
      return 'continue'
    case 'waiting':
      return 'open'
    default:
      return undefined
  }
}
