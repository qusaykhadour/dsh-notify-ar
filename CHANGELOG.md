# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] — 2026-11-08

### Fixed

- **An unanswered permission prompt no longer denies the action.** When a toast went
  unanswered — the deadline passed, or our own toast code threw — the plugin returned
  `'unavailable'`. In a Cordis waterfall that *claims* the request and fails it closed, so the
  user silently lost the action even though they never refused it. `decideByToast` now returns a
  dedicated `DEFER` marker, and the listener turns it into `next()`, handing the request back to
  the remaining answerers (the in-app prompt). This restores the behaviour SPEC §F1 promised and
  matches the plugin's stated rule: never block the app.
- Only an explicit `allowed-once`, `rejected`, or `cancelled` is returned as a decision now.

### Added

- `scripts/test-approval-waterfall.mjs` — mounts the real plugin against a fake Cordis context
  and drives the actual `approval/request` listener, asserting that a non-decision calls `next()`
  exactly once, that an internal failure also defers, and that the disabled and no-agent paths
  pass straight through.

### Verified

- Re-checked against DSH **0.2.2-rc.1**: every API this plugin uses still exists —
  `sessionController.prompt(request, signal)`, `cancel(request)`, the `agent/status` event,
  `sessionProjections`, and the `approval/request` waterfall (subscribed with `prepend`).

## [0.1.1] — 2026-10-09

Documentation and packaging only; no behaviour change.

### Changed

- `LICENSE` is now plain MIT, so GitHub's license detector recognises it as MIT rather than
  "Other / NOASSERTION".
- Attribution to `dsh-notify` moved into a dedicated `NOTICE.md`, which also documents what
  differs between the two projects and which Windows components are used.
- `package.json` gained a `test` script that runs the full suite, and dropped a `teardown` script
  that pointed at a file which was never shipped. `NOTICE.md` added to the published files.

## [0.1.0] — 2026-10-09

First release. Every headline behaviour below was verified on real hardware, not just in tests.

### Added

- **Permission buttons** (`approve` / `reject`): when the agent requests a sandbox escalation, a
  toast offers **Allow**, and the decision reaches the approval service without the user opening the
  app. Verified live: `approval-request` → `toast approval` → `click approve` → `approve settled=true`.
- **Continue button** (`continue`): nudges the agent onward after it goes idle. Verified live from a
  toast the plugin raised by itself.
- **Stop button** (`stop`): ends the running turn while keeping the queued inbox work.
- **Open-app button** (`open`): focuses the DSH window through `dsh://open`.
- **Bilingual copy** (`ar` / `en`) with RTL-aware bidi isolation for Latin identifiers, and the
  language defaulting to the app's own.
- **Single-use nonce authorisation** on every toast: forged, replayed, expired, or unknown clicks are
  refused. Allowed actions are a whitelist.
- **`click-gateway.exe`**, compiled locally at install time with the `csc.exe` that ships with
  Windows, because the notification broker refuses to launch a script host as a protocol handler.
- **Install script** (`scripts/setup.mjs`) that compiles the gateway, registers the AppUserModelId
  through the shell property store, and points the `dshnar://` scheme at it — verifying every step.
- **Test suite**: toast/XML building, the full click pipeline including replay refusal, and the
  approval decision logic (26 checks) with its end-to-end wiring.
- **`scripts/smoke.mjs`** for a live end-to-end check against a real toast.

### Notes

- The plugin registers under the id `dsh-plugin-notify-ar`; the package name is `dsh-notify-ar`.
- Its own AppUserModelId (`Qusay.DshNotifyAr`) keeps its toasts out of the notification history
  bucket that `dsh-notify` shares with PowerShell.
