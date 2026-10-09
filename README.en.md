# dsh-notify-ar

**Arabic-first Windows notifications with buttons that actually do something, for DeepSeek Harness.**

The agent finishes while you are away from the screen. Instead of coming back to the app, press the
button on the toast and the agent carries on. And when the agent asks for **permission**, you allow
or reject it straight from the notification — while it keeps working.

[العربية](README.md) · [Full spec](https://github.com/qusaykhadour/dsh-notify-ar/blob/main/SPEC.md)

---

## The problem

The existing `dsh-notify` plugin sends a **hard-coded Chinese** toast whose click **does nothing** —
it is built with `activationType="background"`, as the author's own comment in the source notes.

So you get told "finished", and you still walk back to the app to continue, or to answer a permission
prompt.

## What `dsh-notify-ar` does

| Notification | Button | Result |
|---|---|---|
| 🥇 **Permission request** | **Allow** | the escalation is granted — without opening the app |
| Task finished | **Continue** | the agent picks up where it left off |
| Task running | **Stop** | ends the turn (the inbox queue is kept) |
| Any state | **Open app** | brings the DSH window forward |

- **Arabic + English** with proper RTL · **the default language follows the app**
- **Its own identity** (`Qusay.DshNotifyAr`) — it does not share PowerShell's notification store
- **Secure**: every toast carries a **single-use nonce**, so a stale or forged click is refused

## Install

```powershell
dsh plugin --profile desktop add dsh-notify-ar
node "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-notify-ar\scripts\setup.mjs"
```

Then **restart DSH**.

`setup.mjs` does three things:
1. Compiles `click-gateway.exe` with the local `csc.exe` (ships with Windows — **nothing is downloaded**)
2. Registers the AppUserModelId via a Start Menu shortcut carrying `System.AppUserModel.ID`
3. Registers the `dshnar://` scheme pointing at that exe

> ⚠️ **Why a compiled exe?** Probing proved Windows will **not** launch `powershell.exe` or `cmd.exe`
> as a protocol handler — the buttons render and then do nothing. A real executable is required.

## Configuration

Set through the profile's `cordis.patch.yml`:

```yaml
- id: dsh-plugin-notify-ar
  name: dsh-notify-ar
  config:
    locale: auto          # auto | ar | en
    enabled: true
    rootsOnly: true       # your own sessions only, not subagents
    notifyApproval: true  # the permission buttons
    cooldownMs: 10000     # minimum gap between toasts for one session
    aumid: Qusay.DshNotifyAr
```

## Limitations (honestly)

- **Buttons work only while the app is running** (minimised is fine) — the agent lives inside that
  process. If it is closed, the button just opens it.
- **One usable action per toast** — Windows discards a toast after its first press, so it is one
  decision per notification.
- **Approvals require an explicit request**: the agent must pass `sandbox_permissions` together with
  `justification`. A plain denied write is refused by the sandbox directly and never asks.
- **Installing needs wider permissions** — registry writes are blocked inside the DSH sandbox.

## Security

The click bridge is a JSONL file, so any local process could append to it. Therefore:

- every toast carries a random **128-bit nonce**, usable **once**
- a forged, replayed, or expired nonce is **refused** (replay refusal is covered by a test)
- allowed actions are a whitelist: `approve` · `reject` · `continue` · `stop` · `open`
- the data directory is locked down on a best-effort basis (that step needs `SeSecurityPrivilege`;
  when unavailable it is skipped quietly, and the nonce remains the real gate)

## Development

```powershell
cd Projects\notify-ar\plugin
node scripts\test-toast.mjs          # XML building + Arabic
node scripts\test-pipeline.mjs       # the whole click path + security (9 checks)
node scripts\test-approval.mjs       # approval logic (26 checks)
node scripts\test-approval-wire.mjs  # the full approval path
node scripts\smoke.mjs --action continue   # a real toast, then waits for the click
```

## License

**MIT** — © 2026 Qusay Ali Khadour.

Built on ideas from [`dsh-notify`](https://github.com/Pasumao/dsh-plugin-notify) © 2026 Pasumao (MIT),
with thanks. The difference: `dsh-notify-ar`'s buttons **work**, and its copy is **not Chinese**.
