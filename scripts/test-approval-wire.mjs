/**
 * End-to-end test of the permission-button path.
 *
 * Simulates the approval service calling our listener, then feeds a real click
 * through the bridge file, and asserts the request is answered with the right
 * outcome. This is the headline feature, so it gets its own test.
 *
 * Run: node scripts/test-approval-wire.mjs
 */
import { mkdtempSync, appendFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NonceStore, buildUri } from '../lib/protocol.js'
import { watchClicks } from '../lib/reader.js'
import { decideByToast, GRANT, REJECT } from '../lib/approval.js'
import { buildToastXml } from '../lib/toast.js'

const dir = mkdtempSync(join(tmpdir(), 'dshnar-approval-'))
const bridge = join(dir, 'clicks.jsonl')
writeFileSync(bridge, '', 'utf8')

const nonces = new NonceStore({ ttlMs: 60_000 })
const pending = new Map()
const shown = []

const stop = watchClicks({
  path: bridge,
  pollMs: 40,
  verify: (r) => nonces.consume(r.nonce) !== null,
  onClick: (r) => {
    const resolve = pending.get(r.nonce)
    if (resolve === undefined) return
    pending.delete(r.nonce)
    resolve(r.action === 'approve' ? GRANT : REJECT)
  },
})

/** Mimic the plugin's `show` for an approval toast. */
function show({ tool }) {
  return new Promise((resolve) => {
    const nonce = nonces.mint({ action: 'approve', sessionId: 'session-x' })
    pending.set(nonce, resolve)
    const uri = buildUri({ action: 'approve', nonce, session: 'session-x' })
    const xml = buildToastXml({
      title: 'dsh — طلب إذن',
      body: `الوكيل بده إذن مشان: ${tool}`,
      button: { text: 'موافق', uri },
    })
    shown.push({ uri, xml })

    // Simulate the user pressing the button shortly after.
    setTimeout(() => {
      appendFileSync(bridge, JSON.stringify({ arg: uri }) + '\n', 'utf8')
    }, 120)
  })
}

console.log('=== 1. a permission request answered by the toast ===')
const outcome = await decideByToast({
  request: { toolName: 'Bash', displayReason: 'Run a shell command' },
  show,
  timeoutMs: 5000,
  log: (m) => console.log('  [log]', m),
})
console.log('  outcome:', outcome)
console.log('  toast title had Arabic:', shown[0]?.xml.includes('طلب إذن'))
console.log('  button label was موافق :', shown[0]?.xml.includes('موافق'))
console.log('  uri carried the nonce  :', shown[0]?.uri.includes('nonce='))

console.log('\n=== 2. the same click replayed must not answer a second request ===')
const replayNonce = nonces.mint({ action: 'approve', sessionId: 'session-y' })
const replayUri = buildUri({ action: 'approve', nonce: replayNonce, session: 'session-y' })
nonces.consume(replayNonce) // it was answered once already
appendFileSync(bridge, JSON.stringify({ arg: replayUri }) + '\n', 'utf8')
await new Promise((r) => setTimeout(r, 300))
console.log('  pending map after replay:', pending.size, '(should stay 0)')

stop()

const failures = []
if (outcome !== GRANT) failures.push(`expected ${GRANT}, got ${outcome}`)
if (!shown[0]?.xml.includes('طلب إذن')) failures.push('Arabic title missing')
if (!shown[0]?.uri.includes('nonce=')) failures.push('nonce missing from uri')
if (pending.size !== 0) failures.push('replay created a pending entry')

console.log('')
if (failures.length === 0) {
  console.log('✔ permission-button path works end to end')
} else {
  console.log('✖ ' + failures.join('; '))
}

rmSync(dir, { recursive: true, force: true })
process.exit(failures.length === 0 ? 0 : 1)
