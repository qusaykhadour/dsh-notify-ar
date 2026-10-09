# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
