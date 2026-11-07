/**
 * Integration test for the approval waterfall contract.
 *
 * The unit tests cover `decideByToast` in isolation; this one mounts the real
 * plugin with a fake Cordis context and drives the actual `approval/request`
 * listener it registers. That is the only way to prove the thing that was
 * broken: whether a non-decision is handed back with `next()` instead of being
 * claimed as `'unavailable'` (which would deny an action the user never
 * refused).
 *
 * Run: node scripts/test-approval-waterfall.mjs
 */
import { apply } from '../lib/index.js'

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

/** Mount the plugin and capture the approval listener it registers. */
function mount(config = {}) {
  const listeners = new Map()
  const effects = []
  const ctx = {
    logger: { warn() {}, info() {}, debug() {} },
    on(event, handler) {
      listeners.set(event, handler)
      return () => listeners.delete(event)
    },
    effect(factory) {
      effects.push(factory)
      return () => {}
    },
    get() {
      return undefined
    },
    sessionController: {
      async prompt() {
        return { accepted: true }
      },
      cancel() {
        return { accepted: true }
      },
    },
  }
  apply(ctx, { debugLog: '', approvalTimeoutMs: 120, notifyApproval: true, ...config })
  return { approval: listeners.get('approval/request'), listeners }
}

const request = { toolName: 'pwsh', reason: 'needs disk access', agent: { id: 'session-x', session: { id: 'session-x' } } }

console.log('=== 1. no answer in time => next() is called, nothing is decided ===')
{
  const { approval } = mount()
  let nextCalls = 0
  const outcome = await approval(request, async () => {
    nextCalls++
    return 'delegated-outcome'
  })
  check('delegated to the next answerer', outcome, 'delegated-outcome')
  check('next() called exactly once', nextCalls, 1)
}

console.log('\n=== 2. our own failure => also defers (never denies) ===')
{
  const { approval } = mount()
  let nextCalls = 0
  // A request whose `signal` getter throws forces the handler down its catch
  // path, standing in for any internal failure.
  const hostile = {
    toolName: 'pwsh',
    agent: { id: 'session-y', session: { id: 'session-y' } },
    get signal() {
      throw new Error('boom')
    },
  }
  const outcome = await approval(hostile, async () => {
    nextCalls++
    return 'delegated-after-failure'
  })
  check('still delegated after an internal throw', outcome, 'delegated-after-failure')
  check('next() called once', nextCalls, 1)
}

console.log('\n=== 3. disabled by config => immediate next(), no toast, no wait ===')
{
  const { approval } = mount({ notifyApproval: false })
  let nextCalls = 0
  const started = Date.now()
  const outcome = await approval(request, async () => {
    nextCalls++
    return 'disabled-passthrough'
  })
  check('passes through', outcome, 'disabled-passthrough')
  check('did not wait for the timeout', Date.now() - started < 100, true)
}

console.log('\n=== 4. a request without an agent => immediate next() ===')
{
  const { approval } = mount()
  let nextCalls = 0
  const outcome = await approval({ toolName: 'pwsh' }, async () => {
    nextCalls++
    return 'no-agent-passthrough'
  })
  check('passes through', outcome, 'no-agent-passthrough')
  check('next() called once', nextCalls, 1)
}

console.log('\n=== 5. the listener is registered for approval/request ===')
{
  const { approval } = mount()
  check('a listener exists', typeof approval, 'function')
}

console.log(`\n${failures === 0 ? '✔ waterfall contract holds' : `✖ ${failures} failure(s)`}`)
process.exit(failures === 0 ? 0 : 1)
