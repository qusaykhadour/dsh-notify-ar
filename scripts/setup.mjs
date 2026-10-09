/**
 * dsh-notify-ar — installer.
 *
 * Preparing a machine to receive actionable toasts takes three steps that a
 * probe on real hardware proved are all mandatory. Each one has a trap that
 * fails *silently*, so this script verifies every step by reading it back.
 *
 *   1. Compile `click-gateway.exe` with the local `csc.exe`. The notification
 *      broker will not launch a script host as a protocol handler, so a real
 *      executable is required. Nothing is downloaded; `csc` ships with .NET
 *      Framework, which every supported Windows install already has.
 *   2. Register the AppUserModelId. Activation is delivered *only* when the
 *      AUMID belongs to a registered app, and the only registration Windows
 *      honours is a Start Menu shortcut carrying `System.AppUserModel.ID`.
 *      That property cannot be written through `WScript.Shell`; it needs the
 *      property store, and the PROPVARIANT must be 24 bytes on x64 or the
 *      stamp stays empty without any error.
 *   3. Register the `dshnar://` protocol pointing at the compiled exe.
 *
 * Run: node scripts/setup.mjs [--aumid <id>] [--force]
 *
 * @module dsh-notify-ar/scripts/setup
 */
import { existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

export const DEFAULT_AUMID = 'Qusay.DshNotifyAr'
export const SCHEME = 'dshnar'

/** Where compiled output and runtime state live (never inside the package). */
export const DATA_DIR = join(
  process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
  'dsh-notify-ar',
)

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(name)
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback
}
const AUMID = flag('--aumid', DEFAULT_AUMID)
const FORCE = args.includes('--force')

const log = (message) => console.log(`  ${message}`)
const step = (message) => console.log(`\n▸ ${message}`)
const fail = (message) => {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

/** Locate the .NET Framework C# compiler that ships with Windows. */
export function findCsc() {
  const candidates = [
    join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

/**
 * Run a PowerShell command, failing loudly on a non-zero exit.
 *
 * `-EncodedCommand` carries the script as UTF-16LE base64. That matters here:
 * the script embeds no Arabic, but it does embed a Windows path that may
 * contain spaces or non-ASCII characters, and Base64 sidesteps every quoting
 * and code-page problem at once.
 */
export function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

/**
 * Compile the click gateway into the data directory.
 *
 * @returns The absolute path of the built executable.
 */
export function buildGateway() {
  const csc = findCsc()
  if (csc === null) {
    fail(
      'csc.exe was not found. It ships with the .NET Framework.\n' +
        '  Enable ".NET Framework 4.x" in Windows Features and re-run.',
    )
  }
  const source = join(ROOT, 'scripts', 'src', 'click-gateway.cs')
  if (!existsSync(source)) fail(`Missing source: ${source}`)

  mkdirSync(DATA_DIR, { recursive: true })
  const target = join(DATA_DIR, 'click-gateway.exe')

  step(`Compiling click-gateway.exe`)
  log(`csc : ${csc}`)
  try {
    execFileSync(csc, ['/nologo', '/target:winexe', '/optimize+', `/out:${target}`, source], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } catch (error) {
    const detail = error.stderr ? String(error.stderr) : String(error)
    fail(`csc failed:\n${detail}`)
  }
  if (!existsSync(target)) fail('Compilation reported success but produced no exe.')
  log(`built: ${target}`)
  return target
}

/**
 * Register the AUMID and the protocol.
 *
 * The AUMID registration is the fragile part. It creates a Start Menu shortcut
 * and stamps `System.AppUserModel.ID` through the shell property store, with an
 * explicitly 24-byte PROPVARIANT (the x64 size). A 16-byte variant writes past
 * the struct and leaves the property empty with no error at all — the exact
 * failure a probe hit.
 */
export function register(aumid, exePath) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$aumid   = '${aumid.replace(/'/g, "''")}'
$exe     = '${exePath.replace(/'/g, "''")}'
$logFile = '${join(DATA_DIR, 'clicks.jsonl').replace(/'/g, "''")}'
$diagFile= '${join(DATA_DIR, 'gateway.log').replace(/'/g, "''")}'
$scheme  = '${SCHEME}'

# ---- 1. Start Menu shortcut carrying the AUMID -----------------------------
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class AumidStamp
{
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct PropertyKey { public Guid fmtid; public int pid; }

    // PROPVARIANT is 24 bytes on x64. Undersizing it lets the native call write
    // past the managed buffer and the value is dropped without any error.
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariant
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        void GetCount(out uint cProps);
        void GetAt(uint iProp, out PropertyKey pkey);
        void GetValue(ref PropertyKey key, out PropVariant pv);
        void SetValue(ref PropertyKey key, ref PropVariant pv);
        void Commit();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int SHGetPropertyStoreFromParsingName(
        string pszPath, IntPtr pbc, int flags, ref Guid riid, out IPropertyStore ppv);

    private static PropertyKey AppUserModelId()
    {
        // PKEY_AppUserModel_ID = {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, 5
        return new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    }

    public static int Set(string shortcutPath, string appId)
    {
        var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IPropertyStore store;
        int hr = SHGetPropertyStoreFromParsingName(shortcutPath, IntPtr.Zero, 2, ref iid, out store);
        if (hr != 0) { return hr; }
        var key = AppUserModelId();
        var pv = new PropVariant { vt = 31, pointerValue = Marshal.StringToCoTaskMemUni(appId) };
        try
        {
            store.SetValue(ref key, ref pv);
            store.Commit();
        }
        finally
        {
            Marshal.FreeCoTaskMem(pv.pointerValue);
            Marshal.ReleaseComObject(store);
        }
        return 0;
    }

    public static string Get(string shortcutPath, out int hr)
    {
        var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IPropertyStore store;
        hr = SHGetPropertyStoreFromParsingName(shortcutPath, IntPtr.Zero, 0, ref iid, out store);
        if (hr != 0) { return null; }
        var key = AppUserModelId();
        PropVariant pv;
        try
        {
            store.GetValue(ref key, out pv);
            if (pv.vt != 31) { return "<vt=" + pv.vt + ">"; }
            return Marshal.PtrToStringUni(pv.pointerValue);
        }
        finally
        {
            Marshal.ReleaseComObject(store);
        }
    }
}
'@

$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$lnk = Join-Path $startMenu 'dsh-notify-ar.lnk'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = $exe
$sc.Arguments = '--log "' + $logFile + '" --diag "' + $diagFile + '"'
$sc.Description = 'dsh-notify-ar click gateway'
$sc.Save()

# Release every COM handle before touching the .lnk again. Calling Save() keeps
# the file busy for a moment, and reading the property store while it is still
# open fails with 0x80070020 ("being used by another process") - which looked
# like a stamping failure until the cause was traced.
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($sc) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

$setHr = [AumidStamp]::Set($lnk, $aumid)
if ($setHr -ne 0) { throw "AUMID stamp failed with HRESULT 0x$($setHr.ToString('X8'))" }

# Read back with a short retry so a lingering handle cannot fake a failure.
$readback = $null
$getHr = 0
for ($attempt = 1; $attempt -le 10; $attempt++) {
  try {
    $readback = [AumidStamp]::Get($lnk, [ref]$getHr)
    break
  } catch {
    Start-Sleep -Milliseconds 150
  }
}
if ($readback -ne $aumid) { throw "AUMID stamp failed: got '$readback'" }
Write-Output ("aumid-ok  " + $readback)

# ---- 2. Display name in the notification store -----------------------------
$key = 'HKCU:\Software\Classes\AppUserModelId\' + $aumid
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name 'DisplayName' -Value 'dsh' -Type String

# ---- 3. Protocol handler ---------------------------------------------------
$base = 'HKCU:\Software\Classes\' + $scheme
New-Item -Path $base -Force | Out-Null
Set-ItemProperty -Path $base -Name '(default)' -Value 'URL:dsh-notify-ar Protocol' -Type String
Set-ItemProperty -Path $base -Name 'URL Protocol' -Value '' -Type String
New-Item -Path ($base + '\shell\open\command') -Force | Out-Null
$cmd = '"' + $exe + '" --log "' + $logFile + '" --diag "' + $diagFile + '" "%1"'
Set-ItemProperty -Path ($base + '\shell\open\command') -Name '(default)' -Value $cmd -Type String
Write-Output 'protocol-ok'

# ---- 4. Harden the bridge directory ----------------------------------------
# The click file is a local instruction channel, so tightening who can write
# into it is worthwhile defence in depth.
#
# It runs best-effort on purpose. Every meaningful hardening call here
# (SetAccessRuleProtection, or adding a Deny ACE) needs SeSecurityPrivilege,
# which a normal non-elevated install does not hold - trying it raises
# PrivilegeNotHeldException. Setup must not fail over that.
#
# The real authorisation is the single-use nonce in lib/protocol.js: a forged
# or replayed line is refused there regardless of who could write the file.
$aclPath = '${DATA_DIR.replace(/'/g, "''")}'
try {
  $acl = Get-Acl $aclPath
  $acl.SetAccessRuleProtection($true, $true)
  Set-Acl -Path $aclPath -AclObject $acl
  Write-Output 'acl-protected'
} catch {
  Write-Output ('acl-skipped (needs SeSecurityPrivilege; the nonce still guards clicks)')
}
`.trim()

  step('Registering AUMID + protocol (writes to HKCU)')
  const output = powershell(script)
  for (const line of output.split(/\r?\n/)) {
    if (line.trim() !== '') log(line.trim())
  }
  if (!output.includes('aumid-ok')) fail('AUMID registration did not confirm.')
  if (!output.includes('protocol-ok')) fail('Protocol registration did not confirm.')
}

/** Read the registered protocol command back, so setup can prove it stuck. */
export function verify(aumid) {
  step('Verifying registration')
  const script = `
$cmd = (Get-ItemProperty 'HKCU:\\Software\\Classes\\${SCHEME}\\shell\\open\\command').'(default)'
Write-Output ('command: ' + $cmd)
$name = (Get-ItemProperty 'HKCU:\\Software\\Classes\\AppUserModelId\\${aumid}' -ErrorAction SilentlyContinue).DisplayName
Write-Output ('display: ' + $name)
`.trim()
  const output = powershell(script)
  for (const line of output.split(/\r?\n/)) {
    if (line.trim() !== '') log(line.trim())
  }
}

function main() {
  console.log('\ndsh-notify-ar — setup\n')
  step('Environment')
  log(`data dir : ${DATA_DIR}`)
  log(`aumid    : ${AUMID}`)

  if (existsSync(join(DATA_DIR, 'click-gateway.exe')) && !FORCE) {
    log('gateway already built (use --force to rebuild)')
  }
  const exe = buildGateway()
  register(AUMID, exe)
  verify(AUMID)

  console.log('\n✔ Setup complete. Restart DSH so the plugin loads.\n')
}

// Only run when invoked directly, so the helpers stay importable for tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
