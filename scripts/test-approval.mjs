/**
 * Tests for the approval decision logic.
 *
 * The important property is fail-safe: every uncertain path must defer
 * (`'unavailable'`) so the in-app prompt still appears, and only an explicit
 * user answer may grant or deny.
 *
 * Run: node scripts/test-approval.mjs
 */
import { decideByToast, describeTool, pickLocalized, withTimeout, GRANT, REJECT } from '../lib/approval.js'

let failures = 0
const check = (label, actual, expected) => {
  const ok = actual === expected
  if (!ok) failures++
  console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

const logs = []
const log = (m) => logs.push(m)

console.log('=== 1. the user pressed Allow ===')
check('grants on Allow',
  await decideByToast({ request: { toolName: 'Bash' }, show: async () => GRANT, log }),
  GRANT)

console.log('\n=== 2. the user pressed Reject ===')
check('denies on Reject',
  await decideByToast({ request: { toolName: 'Bash' }, show: async () => REJECT, log }),
  REJECT)

console.log('\n=== 3. no answer (timeout) => defer to the app ===')
check('defers when unanswered',
  await decideByToast({ request: { toolName: 'Bash' }, show: async () => null, log }),
  'unavailable')

console.log('\n=== 4. our own show() threw => must NOT grant ===')
check('fails safe on a thrown error',
  await decideByToast({
    request: { toolName: 'Bash' },
    show: async () => { throw new Error('toast exploded') },
    log,
  }),
  'unavailable')

console.log('\n=== 5. an already-aborted request => cancelled ===')
const aborted = new AbortController()
aborted.abort()
check('respects an aborted signal',
  await decideByToast({ request: { toolName: 'Bash', signal: aborted.signal }, show: async () => GRANT, log }),
  'cancelled')

console.log('\n=== 6. a rogue show() return value => defer, never grant ===')
check('ignores an unexpected answer',
  await decideByToast({ request: { toolName: 'Bash' }, show: async () => 'yes-please', log }),
  'unavailable')

console.log('\n=== 7. a hung toast hits the deadline => defer ===')
const t0 = Date.now()
check('times out to null (defer)',
  await decideByToast({ request: { toolName: 'Bash' }, show: () => new Promise(() => {}), timeoutMs: 150, log }),
  'unavailable')
check('actually waited about the timeout', Date.now() - t0 >= 140, true)

console.log('\n=== 8. withTimeout never rejects ===')
check('resolves null on reject', await withTimeout(Promise.reject(new Error('x')), 500), null)
check('resolves the value when fast', await withTimeout(Promise.resolve('ok'), 500), 'ok')

console.log('\n=== 9. describeTool prefers the richest label ===')
check('prefers displayReason', describeTool({ displayReason: 'Run a shell command', toolName: 'Bash' }), 'Run a shell command')
check('then reason', describeTool({ reason: 'needs disk access', toolName: 'Bash' }), 'needs disk access')
check('then toolName', describeTool({ toolName: 'Bash' }), 'Bash')
check('falls back to a literal', describeTool({}), 'unknown')
check('ignores blank strings', describeTool({ displayReason: '   ', toolName: 'Bash' }), 'Bash')

console.log('\n=== 10. the localized displayReason map (the real sandbox shape) ===')
// The sandbox escalation path sends { en, zh } — treating it as text would
// have rendered "[object Object]" in the toast.
const sandboxReason = { en: 'Allow this operation with danger-full-access permissions: need D:', zh: '允许本次操作使用 danger-full-access 权限' }
check('picks the locale entry', pickLocalized(sandboxReason, 'en'), sandboxReason.en)
check('picks a regional tag', pickLocalized({ 'ar-SA': 'مرحبا' }, 'ar-SA'), 'مرحبا')
check('falls back to en', pickLocalized(sandboxReason, 'fr'), sandboxReason.en)
check('never yields [object Object]', String(describeTool({ displayReason: sandboxReason, toolName: 'pwsh' })).includes('[object'), false)
check('describes an escalation', describeTool({ displayReason: sandboxReason, toolName: 'pwsh' }, 'en'), sandboxReason.en)
check('handles a plain string', pickLocalized('plain', 'ar'), 'plain')
check('handles a blank string', pickLocalized('   ', 'ar'), null)
check('handles null', pickLocalized(null, 'ar'), null)
check('handles a number', pickLocalized(42, 'ar'), null)
check('handles an empty map', pickLocalized({}, 'ar'), null)

console.log('\n=== 11. diagnostics were emitted for deferrals ===')
check('logged the deferral', logs.some((l) => l.includes('approval-deferred')), true)
check('logged the failure', logs.some((l) => l.includes('approval-show-failed')), true)

console.log(`\n${failures === 0 ? '✔ all approval tests passed' : `✖ ${failures} failure(s)`}`)
process.exit(failures === 0 ? 0 : 1)
