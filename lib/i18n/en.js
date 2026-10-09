/**
 * dsh-notify-ar — English strings (LTR).
 *
 * Mirrors the exact key shape of `./ar.js`; `./index.js` falls back to English
 * for any key a locale omits, so a partial translation can never break a toast.
 *
 * @module dsh-notify-ar/i18n/en
 */
export default {
  title: {
    approval: 'Permission request',
    finished: 'Task finished',
    aborted: 'Task stopped',
    error: 'Task error',
    limit: 'Output limit reached',
    waiting: 'Waiting for your choice',
    disposed: 'Session closed',
  },

  body: {
    approval: 'The agent needs approval: {tool}',
    approvalReason: 'Reason: {reason}',
    finished: 'Finished — {workspace} · {session}',
    aborted: 'Stopped — {workspace} · {session}',
    error: 'Something failed — {workspace} · {session}',
    limit: 'Hit the output limit — {workspace} · {session}',
    waiting: 'The agent is waiting on you — {workspace} · {session}',
    disposed: 'Session closed — {workspace} · {session}',
  },

  button: {
    allow: 'Allow',
    reject: 'Reject',
    continue: 'Continue',
    stop: 'Stop',
    open: 'Open app',
  },

  notice: {
    expired: 'That button is stale — open the app and decide there.',
    unknown: 'Unrecognised click — ignored.',
  },
}
