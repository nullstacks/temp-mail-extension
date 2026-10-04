<div align="center">

# ✉ TempMail for temp.tf

**Persistent disposable email for Chrome & Brave — powered by the free [temp.tf API](https://temp.tf/document)**

One address across tabs, sessions and restarts until *you* press **Change**. One-click form autofill with a fake identity, live inbox with OTP chips, safe message viewer.

[![Chrome](https://img.shields.io/badge/Chrome-✓-4285F4?logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)
[![Brave](https://img.shields.io/badge/Brave-✓-FB542B?logo=brave&logoColor=white)](https://brave.com/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34d399)]()
[![API](https://img.shields.io/badge/API-temp.tf-10b981)](https://temp.tf/document)
[![License](https://img.shields.io/badge/license-MIT-64748b)](LICENSE)

</div>

---

## Why

Sign-ups, OTP codes and throwaway accounts shouldn't touch your real inbox.
Most temp-mail extensions give you a fresh address every session and make you
switch tabs to check mail. TempMail pins one address to your toolbar, keeps it
until **you** rotate it, and fills entire sign-up forms — email, name, address,
phone, company, password — with one click.

## Features

### 📌 Persistent address
The address persists in `chrome.storage` across tabs, browser sessions and
restarts. It keeps receiving mail until you press **Change** — badge, notifications
and autofill all keep working. Previous addresses (last 5) stay in Settings:
**Use** to switch back, or copy.

### ⚡ One-click form autofill
- **Autofill form** button (or right-click → *Autofill form with TempMail*, or
  **Alt+Shift+F**) fills the whole page: email, first/last/full name, username,
  **company**, password, phone (+ intl), street, city, state, ZIP/PIN, country,
  age, gender — including **dropdowns and radio groups**.
- An always-visible **mini envelope icon** sits inside every email field on any
  site (closed shadow root — page CSS/JS can't touch it): **click = fill email,
  Shift+click = autofill the whole form**.
- Works with React, Vue, Angular and plain forms (native value setters +
  `input`/`change` events), including open **shadow DOM** and contenteditable.

### 🎭 Fake identity generator
Every address ships with a consistent fake identity — click any row to copy:

Name · Username · Password · **Company** · Gender · Age & DOB · Phone (+intl) ·
Street · City · State · ZIP/PIN · Country

- Countries: **US, India, UK, Canada, Australia, Germany** — city, state,
  postcode, dialing code and legal suffix (Inc/LLC/Ltd/GmbH/Pvt Ltd…) stay
  consistent per country.
- Settings: country, gender, age range; "Generate new identity" on demand.
- Companies are fictional ("Nimbus Inc", "Cobalt Industries", "Marigold AG"…);
  phone numbers use reserved fictional ranges (555-01xx) where they exist.
  Random data for testing/privacy — not for impersonation.

### 📬 Live inbox
- Background polling + **unread badge** on the toolbar icon + desktop
  **notifications** (deduped across restarts).
- **Check every**: 3 s · 5 s · 10 s · 15 s · 30 s · 1 · 2 · 5 · 10 minutes.
  (Sub-30 s intervals are best-effort: they run while the browser is active and
  drift to ~30 s if the service worker idles — Chrome clamps `chrome.alarms`.)
- **Mark all read**, per-message unread state.

### 📨 Safe message viewer
- **Sandboxed iframe** rendering with a strict CSP — scripts never run.
- **Remote images blocked** until you explicitly press *Load* (tracking-pixel
  protection); inline `cid:` images resolved automatically.
- **OTP chips** — verification codes auto-extracted, one click to copy.
- **Verification links** detected with Open / Copy buttons.
- Attachment download.

### 📋 Copy anywhere
- Click the address to copy; right-click any field → *Fill with temp email* /
  *Fill with generated password*; OTP chips and identity rows are one-click copy.

## Install

### From source (Chrome / Brave / Edge / any Chromium)

```bash
git clone https://github.com/nullstacks/temp-mail-extension.git
```

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode**
3. **Load unpacked** → select the cloned folder
4. Pin the ✉ icon from the puzzle-piece menu

### Prebuilt zip

Grab the latest zip from
[Releases](https://github.com/nullstacks/temp-mail-extension/releases) — unzip
and Load unpacked the folder.

**Shortcuts** (all customizable at `chrome://extensions/shortcuts`):
`Alt+Shift+F` autofill form · `Alt+Shift+M` open popup

## Build

No build step, no dependencies, no bundler — plain MV3 with two contexts
(`shared.js` runs in both the service worker via `importScripts` and the popup).

## API

Powered by [temp.tf](https://temp.tf) — no API key, free.

| Endpoint | Purpose |
|---|---|
| `GET /api/account?dot=1&plus=1[&providers=...]` | get a temp address |
| `POST /api/check {email}` | inbox (+ attachment metadata) |
| `GET /api/attachment?email&messageId&attachmentId` | download attachment |

Rate limit: 60 req/min per IP — `Retry-After` is surfaced in errors.
Gmail / Outlook / Hotmail are documented; high.edu.pl is offered on the
temp.tf site but not in its API docs yet (the extension tries it and tells you
if the API refuses).

## Privacy

- No analytics, no tracking, no network calls except `temp.tf`.
- Address, settings and inbox cache live in your browser's local/session storage.
- Mail HTML renders in a script-disabled sandbox; remote images blocked by default.
- Permissions: `storage` (save address/prefs), `alarms` (inbox polling),
  `notifications` (new mail), `activeTab` + `scripting` (autofill on demand),
  `contextMenus` (right-click fill). Host access limited to `https://temp.tf/*`.

## License

[MIT](LICENSE) © [Nullstacks](https://github.com/nullstacks)

---

<div align="center">

**Part of [Nullstacks](https://github.com/nullstacks)** — AI tools & utilities

</div>
