<div align="center">

# ✉ Nullstacks Temp Mail

**Disposable email browser extension for Chrome & Brave — powered by the free [temp.tf API](https://temp.tf/document)**

One address that stays constant until *you* press Change. One-click form autofill, inbox with OTP copy, sandboxed HTML viewer, attachments.

[![Chrome](https://img.shields.io/badge/Chrome-✓-4285F4?logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)
[![Brave](https://img.shields.io/badge/Brave-✓-FB542B?logo=brave&logoColor=white)](https://brave.com/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34d399)]()
[![API](https://img.shields.io/badge/API-temp.tf-10b981)](https://temp.tf/document)

</div>

---

## Why

Sign-ups, OTP codes, and throwaway accounts shouldn't touch your real inbox.
Most temp-mail extensions give you a random address every session and make you
switch tabs to check it. This one sticks the address in your toolbar and keeps
the same one until **you** decide to rotate it — and fills sign-up forms with
a single click.

## Features

### 📌 Constant address
The address persists in `chrome.storage` and survives browser restarts. It keeps
receiving mail until you press **Change** — new mail notifications, badge count,
and autofill all keep working across sessions.

### 🔄 Change / New
- **Change** retires the current address and generates a fresh one; the old one
  lands in *Recent addresses* (last 10, still copyable — mail already received
  stays in view until rotation).
- **New** generates with your chosen mode:
  - Random + plus alias (default) · Gmail dot alias · Plus alias · Dot + plus
  - Provider filter: any / gmail.com / outlook.com / hotmail.com

### ⚡ One-click autofill
- **Fill on page** button in the popup fills the focused page's email input.
- A floating **✉ temp mail** pill appears next to any email field you focus on
  any site — click it to fill. Uses native value setters + `input`/`change`
  events, so React, Vue, Angular and plain forms all register the value.
- Keyboard shortcut: **Alt+Shift+E** (customizable at `chrome://extensions/shortcuts`).

### 📋 Copy anywhere
- Popup ⧉ button, right-click context menu on any text field, and one-click copy
  from the recent-addresses history.

### 🎛 Custom address
✎ **Custom** → type any address (an alias you own, or a full address) and press
Set. Useful when a site needs a "real-looking" address.

### 📥 Live inbox
- Polls every minute (alarm-based, battery-friendly) + 10 s refresh while the
  popup is open.
- Unread **badge** on the toolbar icon.
- Desktop **notifications** for new mail, deduped across service-worker restarts.
- 429 rate-limit from temp.tf (60 req/min) handled with Retry-After backoff.

### 📨 Message view
- **Sandboxed HTML rendering** in an iframe with scripts disabled (phishing-safe).
- **Auto-extracted OTP/verification codes** with one-click *Copy code*.
- Copy body text · per-attachment download.

## Install

### From source (Chrome / Brave / Edge / any Chromium)

```bash
git clone https://github.com/nullstacks/temp-mail-extension.git
```

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode**
3. **Load unpacked** → select the cloned folder
4. Pin the icon from the puzzle-piece menu

### Prebuilt zip

Grab `nullstacks-temp-mail-v1.0.0.zip` from
[Releases](https://github.com/nullstacks/temp-mail-extension/releases) — unzip
and Load unpacked the folder.

## Build

No build step, no dependencies, no bundler — plain MV3. Icons are generated
with stdlib-only Python:

```bash
python3 test/make_icons.py
```

## API

Powered by [temp.tf](https://temp.tf) — no API key, free.

| Endpoint | Purpose |
|---|---|
| `GET /api/account?dot=1&plus=1[&providers=...]` | get a temp address |
| `POST /api/check {email}` | inbox (+ attachment metadata) |
| `GET /api/attachment?email&messageId&attachmentId` | download attachment |
| `GET /api/stats` | provider breakdown |

Rate limit: 60 req/min per IP — `Retry-After` honored with backoff.

## Privacy

- No analytics, no tracking, no external calls except `temp.tf`.
- Address + inbox cache live in your browser's local storage.
- Mail HTML renders in a script-disabled sandbox.
- Minimal permissions: `storage`, `alarms`, `notifications`, `contextMenus`,
  `clipboardWrite`, `downloads`. The content script is inert unless you
  interact with an email field.

## License

[MIT](LICENSE) © [Nullstacks](https://github.com/nullstacks)

---

<div align="center">

**Part of [Nullstacks](https://github.com/nullstacks)** — AI tools & utilities

</div>
