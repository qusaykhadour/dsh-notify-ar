/**
 * dsh-notify-ar — the toast builder.
 *
 * Turns a notification intent into the XML Windows expects, plus the
 * PowerShell invocation that shows it. Three rules here are absolute, each one
 * learned from a toast that silently failed to appear:
 *
 *   1. The root tag must be `<toast scenario="reminder" activationType="background">`.
 *      Drop `activationType` and Windows discards the whole thing — no toast,
 *      no error, nothing in the Action Center.
 *   2. `&` inside an `arguments` attribute must be written `&amp;`, or the XML
 *      is rejected as malformed.
 *   3. A toast disappears after its first button press, so exactly one action
 *      button per toast is meaningful. Toasts are therefore one decision each.
 *
 * The script is handed to PowerShell as `-EncodedCommand` (UTF-16LE base64).
 * That is not a stylistic choice: a `.ps1` holding Arabic is read as ANSI by
 * PowerShell 5.1 and comes out as mojibake, and passing the text through
 * environment variables still risks code-page damage. Base64 sidesteps both.
 *
 * @module dsh-notify-ar/toast
 */
import { spawn } from 'node:child_process'

/** Escape the five XML metacharacters that can appear in text or attributes. */
export function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Build the toast XML.
 *
 * @param params.title - First line (bold in the toast).
 * @param params.body - Second line.
 * @param params.location - Optional third line, e.g. `workspace · session`.
 * @param params.iconPath - Optional PNG shown as the app logo.
 * @param params.button - Optional `{ text, uri }` action button.
 * @returns The complete `<toast>` XML string.
 */
export function buildToastXml({ title, body, location, iconPath, button }) {
  const parts = []
  if (iconPath) {
    const src = `file:///${String(iconPath).replace(/\\/g, '/')}`
    parts.push(`<image placement="appLogoOverride" src="${xmlEscape(src)}" hint-crop="circle"/>`)
  }
  parts.push(`<text>${xmlEscape(title)}</text>`)
  if (body) parts.push(`<text>${xmlEscape(body)}</text>`)
  if (location) parts.push(`<text>${xmlEscape(location)}</text>`)

  const action = button
    ? `<actions><action content="${xmlEscape(button.text)}" activationType="protocol" arguments="${xmlEscape(button.uri)}"/></actions>`
    : ''

  // Rule 1: the attributes on the root tag are not optional.
  return (
    `<toast scenario="reminder" activationType="background">` +
    `<visual><binding template="ToastGeneric">${parts.join('')}</binding></visual>` +
    action +
    `</toast>`
  )
}

/**
 * The PowerShell program that displays a toast.
 *
 * Parameters arrive as environment variables rather than being interpolated
 * into the script, so no value can break out of its argument and no quoting
 * rule applies. The XML itself is passed as one more environment variable.
 *
 * Note: no backticks appear in this template, because it is itself a template.
 */
export const TOAST_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xmlText = [string]$env:DSHNAR_XML
$aumid   = [string]$env:DSHNAR_AUMID
$tag     = [string]$env:DSHNAR_TAG
if ([string]::IsNullOrEmpty($aumid)) { throw 'DSHNAR_AUMID is required' }
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($xmlText)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
if (-not [string]::IsNullOrEmpty($tag)) { $toast.Tag = $tag }
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($aumid)
$notifier.Show($toast)
`.trim()

/** Locate Windows PowerShell 5.1 (the version whose WinRT projection works). */
export function defaultPowershellPath() {
  const windir = process.env.WINDIR || 'C:\\Windows'
  return `${windir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}

/** Trim the environment so a spawned PowerShell never inherits our cwd quirks. */
function childEnv(extra) {
  const base = {
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    windir: process.env.windir || process.env.WINDIR || 'C:\\Windows',
    TEMP: process.env.TEMP || '',
    TMP: process.env.TMP || '',
    PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
  }
  return { ...base, ...extra }
}

/**
 * Show one toast. Fire-and-forget: a failure is logged and never thrown,
 * because a notification must never be able to break the agent's work.
 *
 * @param ctx - The Cordis context (used for logging).
 * @param params.xml - The toast XML from {@link buildToastXml}.
 * @param params.aumid - The registered AppUserModelId that owns the toast.
 * @param params.tag - Optional tag, used to keep consecutive toasts distinct.
 * @param params.powershellPath - Override for the PowerShell executable.
 * @returns A promise that settles when the child process has been started.
 */
export function showToast(ctx, { xml, aumid, tag, powershellPath }) {
  const ps = powershellPath || defaultPowershellPath()
  const encoded = Buffer.from(TOAST_SCRIPT, 'utf16le').toString('base64')
  let child
  try {
    child = spawn(
      ps,
      ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      {
        env: childEnv({ DSHNAR_XML: xml, DSHNAR_AUMID: aumid, DSHNAR_TAG: tag || '' }),
        windowsHide: true,
        stdio: 'ignore',
      },
    )
  } catch (error) {
    ctx.logger.warn(`dsh-notify-ar: could not launch the toast helper: ${String(error)}`)
    return
  }
  child.on('error', (error) => {
    ctx.logger.warn(`dsh-notify-ar: toast helper failed: ${String(error)}`)
  })
}
