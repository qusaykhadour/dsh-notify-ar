/**
 * Live smoke test — the real product path, end to end.
 *
 * Shows a genuine toast through `lib/toast.js` (the same code the plugin runs),
 * carrying a real single-use nonce. Then it watches the bridge file with
 * `lib/reader.js` and reports what the click did. Nothing here is DSH-specific:
 * this proves the product modules, not the probe scaffolding.
 *
 * Run: node scripts/smoke.mjs
 *   --aumid <id>     override the AppUserModelId (default: Qusay.DshNotifyAr.Dev)
 *   --action <name>  which button to offer: continue | stop | open
 *   --wait <sec>     how long to wait for the click (default 90)
 */
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { buildToastXml, showToast, defaultPowershellPath } from '../lib/toast.js'
import { watchClicks } from '../lib/reader.js'
import { NonceStore, buildUri } from '../lib/protocol.js'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const AUMID = flag('--aumid', 'Qusay.DshNotifyAr.Dev')
const ACTION = flag('--action', 'continue')
const WAIT_SEC = Number(flag('--wait', '90'))
const SESSION = 'session-smoke-test'

const dir = join(process.env.LOCALAPPDATA || '.', 'dsh-notify-ar')
const bridge = join(dir, 'clicks.jsonl')
const exe = join(dir, 'click-gateway.exe')

console.log('dsh-notify-ar — live smoke test\n')
console.log(`  aumid   : ${AUMID}`)
console.log(`  action  : ${ACTION}`)
console.log(`  bridge  : ${bridge}`)
console.log(`  gateway : ${exe} ${existsSync(exe) ? '' : '  <-- MISSING, run setup.mjs'}`)
console.log('')

if (!existsSync(exe)) {
  console.error('No gateway built. Run: node scripts/setup.mjs')
  process.exit(1)
}

const nonces = new NonceStore({ ttlMs: 5 * 60 * 1000 })
const nonce = nonces.mint({ action: ACTION, sessionId: SESSION })
const uri = buildUri({
  action: ACTION,
  nonce,
  session: SESSION,
  text: ACTION === 'continue' ? 'كمّل الشغل من الإشعار' : undefined,
})

const labels = {
  continue: 'تابع',
  stop: 'وقّف',
  open: 'افتح التطبيق',
}

const xml = buildToastXml({
  title: 'dsh — إشعار تجريبي',
  body: 'اضغط الزر وشوف إذا وصلت الضغطة',
  location: 'smoke test · session-smoke-test',
  button: { text: labels[ACTION] ?? ACTION, uri },
})

console.log('  uri     :', uri)
console.log('  button  :', labels[ACTION] ?? ACTION)
console.log('')

// A tiny fake ctx so showToast's logging path is exercised too.
const ctx = {
  logger: {
    warn: (m) => console.warn('  [warn]', m),
    debug: () => {},
  },
}

console.log('▸ showing the toast (look at your screen)…')
showToast(ctx, { xml, aumid: AUMID, powershellPath: defaultPowershellPath() })

let acted = false
const stop = watchClicks({
  path: bridge,
  pollMs: 250,
  verify: (record) => nonces.consume(record.nonce) !== null,
  onClick: (record) => {
    acted = true
    console.log('\n✔ CLICK RECEIVED')
    console.log('  action  :', record.action)
    console.log('  session :', record.sessionId)
    console.log('  text    :', record.text ?? '(none)')
    console.log('  nonce   :', record.nonce)
    console.log('\n  The button works: the gateway fired, the URI was read,')
    console.log('  and the nonce was accepted exactly once.')
  },
  onReject: (reason, detail) => {
    console.log(`  [rejected] ${reason}  ${String(detail).slice(0, 80)}`)
  },
})

console.log(`▸ waiting up to ${WAIT_SEC}s for the click…`)
const deadline = Date.now() + WAIT_SEC * 1000
while (!acted && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 250))
}
stop()

if (!acted) {
  console.log('\n✖ No click arrived in time.')
  console.log('  Check that the toast appeared, and that the AUMID is registered:')
  console.log('    node scripts/setup.mjs')
  process.exit(2)
}
process.exit(0)
