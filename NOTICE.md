# Notices and attribution

`dsh-notify-ar` is released under the MIT License (see [LICENSE](LICENSE)).
© 2026 Qusay Ali Khadour.

## Derivative work

This project borrows ideas, structure, and a few implementation patterns from
[`dsh-notify`](https://github.com/Pasumao/dsh-plugin-notify), © 2026 Pasumao,
which is also released under the MIT License.

In particular, this project follows `dsh-notify`'s approach of delivering toasts
by spawning Windows PowerShell 5.1 with a Base64-encoded (`-EncodedCommand`)
script. That technique avoids every code-page and quoting problem at once, and it
is the reason Arabic text survives the trip into a toast.

What is different here, and why this is a separate project rather than a patch:

| | `dsh-notify` | `dsh-notify-ar` |
|---|---|---|
| Toast buttons | `activationType="background"` — a click does nothing | `activationType="protocol"` — every click performs its action |
| Copy | hard-coded Chinese | bilingual `ar` / `en`, RTL-aware, following the app's language |
| Notification identity | borrows PowerShell's AUMID | registers its own (`Qusay.DshNotifyAr`) |
| Permission requests | not offered | **Allow / Reject from the toast** |
| Click authorisation | n/a | single-use nonce per toast |

## Third-party components

- **Windows PowerShell 5.1** and the **`.NET Framework` `csc.exe` compiler** are
  used at runtime and install time respectively. Both ship with Windows; nothing
  is downloaded or redistributed.
