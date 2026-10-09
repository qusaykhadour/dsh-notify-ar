/**
 * Prove the plugin is live inside the running DSH process.
 *
 * Method: show a real toast with a FORGED nonce, then watch plugin.log. A live
 * plugin tails the bridge file and records `reject nonce-rejected` the moment
 * the forged click lands. If plugin.log gains that line, the plugin is loaded
 * and its security gate works. If nothing appears, the plugin is not running.
 *
 * Run: node scripts/verify-loaded.mjs [--aumid <id>]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (n, d) => {
  const i = args.indexOf(n)
  return i !== -1 && args[i + 1] ? args[i + 1] : d
}
const AUMID = flag('--aumid', 'Qusay.DshNotifyAr')

const dir = join(process.env.LOCALAPPDATA || '.', 'dsh-notify-ar')
const logPath = join(dir, 'plugin.log')
const bridge = join(dir, 'clicks.jsonl')

const before = existsSync(logPath) ? readFileSync(logPath, 'utf8').length : 0
console.log('plugin.log size before:', before)

const uri = 'dshnar://click?action=continue&nonce=forged-load-test&session=session-load-test'
const xml =
  `<toast scenario="reminder" activationType="background"><visual><binding template="ToastGeneric">` +
  `<text>dsh — فحص تحميل الإضافة</text>` +
  `<text>اضغط الزر: ضغطة مزوّرة، لازم تنرفض</text>` +
  `</binding></visual><actions>` +
  `<action content="فحص" activationType="protocol" arguments="${uri.replace(/&/g, '&amp;')}"/>` +
  `</actions></toast>`

// Build the PowerShell program, then hand it over as UTF-16LE base64 so no
// quoting or code-page rule can interfere with the XML.
const ps = [
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
  '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
  '$x.LoadXml($env:DSHNAR_XML)',
  '$t = [Windows.UI.Notifications.ToastNotification]::new($x)',
  `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${AUMID}').Show($t)`,
  "Write-Output 'toast-shown'",
].join('\n')

const encoded = Buffer.from(ps, 'utf16le').toString('base64')
const out = execFileSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded],
  {
    env: {
      SystemRoot: process.env.SystemRoot,
      windir: process.env.windir,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      DSHNAR_XML: xml,
    },
    encoding: 'utf8',
    windowsHide: true,
  },
)
console.log(out.trim())
console.log('\n▸ press the button on the toast now…')

const deadline = Date.now() + 75_000
let found = false
while (Date.now() < deadline && !found) {
  await new Promise((r) => setTimeout(r, 500))
  if (!existsSync(logPath)) continue
  const text = readFileSync(logPath, 'utf8')
  if (text.length > before) {
    const added = text.slice(before)
    if (added.includes('nonce-rejected')) found = true
    else console.log('  [log]', added.trim().split('\n').pop())
  }
}

console.log('')
if (found) {
  console.log('✔ PLUGIN IS LOADED — it saw the click and rejected the forged nonce.')
  console.log('  The security gate works inside the live DSH process.')
} else {
  console.log('✖ No rejection recorded.')
  console.log('  Either the button was not pressed, or the plugin is not loaded.')
  console.log('  Check that dsh-notify-ar is in the profile bundle list and restart DSH.')
}
process.exit(found ? 0 : 2)
