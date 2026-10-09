/**
 * Integration test: click -> reader -> nonce verify -> action dispatch.
 *
 * Runs the real modules against a temp bridge file and a fake `sessionController`,
 * so the whole path is exercised without needing DSH or a live toast.
 *
 * Run: node scripts/test-pipeline.mjs
 */
import { mkdtempSync, appendFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { watchClicks } from '../lib/reader.js'
import { NonceStore, buildUri } from '../lib/protocol.js'

const dir = mkdtempSync(join(tmpdir(), 'dshnar-test-'))
const bridge = join(dir, 'clicks.jsonl')
writeFileSync(bridge, '', 'utf8')

const nonces = new NonceStore({ ttlMs: 60_000 })
const ran = []
const rejected = []

/** Stand-in for ctx.sessionController. */
const sessionController = {
  async prompt(request, signal) {
    if (!signal) throw new TypeError("Cannot read properties of undefined (reading 'throwIfAborted')")
    signal.throwIfAborted()
    ran.push({ kind: 'prompt', sessionId: request.sessionId, text: request.content[0].text })
    return { accepted: true }
  },
  cancel(request) {
    ran.push({ kind: 'cancel', sessionId: request.sessionId })
    return { accepted: true }
  },
}

// Pre-seed: mint one live nonce, and craft attacks that must all be refused.
const liveNonce = nonces.mint({ action: 'stop', sessionId: 'session-abc' })
const liveUri = buildUri({ action: 'stop', nonce: liveNonce, session: 'session-abc' })

const continueNonce = nonces.mint({ action: 'continue', sessionId: 'session-abc' })
const continueUri = buildUri({ action: 'continue', nonce: continueNonce, session: 'session-abc', text: 'كمّل الشغل' })

const stop = watchClicks({
  path: bridge,
  pollMs: 40,
  onClick: async (record) => {
    if (record.action === 'stop') return sessionController.cancel({ sessionId: record.sessionId })
    if (record.action === 'continue') {
      return sessionController.prompt(
        { sessionId: record.sessionId, requestId: 'x', content: [{ type: 'text', text: record.text }] },
        new AbortController().signal,
      )
    }
    ran.push({ kind: record.action })
  },
  onReject: (reason) => rejected.push(reason),
  verify: (record) => nonces.consume(record.nonce) !== null,
})

const click = (uri) => appendFileSync(bridge, JSON.stringify({ ts: new Date().toISOString(), arg: uri }) + '\n', 'utf8')
/** Append a raw line verbatim, for testing malformed input. */
const rawLine = (text) => appendFileSync(bridge, text + '\n', 'utf8')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('=== feeding clicks ===')
click(liveUri)                                       // must act
click(liveUri)                                       // REPLAY: must be refused
click(continueUri)                                   // must act
click('dshnar://click?action=stop&nonce=forged')     // forged nonce: refused
click('dshnar://click?action=hack&nonce=x')          // bad action: refused
click('https://evil.com/?action=stop')               // foreign scheme: refused
rawLine('not json at all')                           // malformed JSON: refused
rawLine(JSON.stringify({ arg: '' }))                 // empty arg: refused
rawLine('')                                          // blank line: ignored

await wait(600)
stop()

console.log('\n=== actions that ran ===')
for (const entry of ran) console.log(' ', JSON.stringify(entry))

console.log('\n=== rejected ===')
console.log(' ', JSON.stringify(rejected))

const cancels = ran.filter((r) => r.kind === 'cancel')
const prompts = ran.filter((r) => r.kind === 'prompt')

console.log('\n=== assertions ===')
const check = (label, ok) => console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}`)
check('exactly one cancel ran (replay blocked)', cancels.length === 1)
check('exactly one prompt ran', prompts.length === 1)
check('prompt carried the Arabic text', prompts[0]?.text === 'كمّل الشغل')
check('forged nonce rejected', rejected.includes('nonce-rejected'))
check('bad action rejected', rejected.includes('unparsable-uri'))
check('foreign scheme rejected', rejected.includes('unparsable-uri'))
check('malformed line rejected', rejected.includes('malformed-line'))
check('empty arg rejected', rejected.includes('empty-arg'))

rmSync(dir, { recursive: true, force: true })
const failed = [
  cancels.length === 1,
  prompts.length === 1,
  prompts[0]?.text === 'كمّل الشغل',
  rejected.includes('nonce-rejected'),
].filter((ok) => !ok).length
process.exit(failed === 0 ? 0 : 1)
