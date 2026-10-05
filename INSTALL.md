# Installing TempMail

Works in **Chrome** and **Brave** (Manifest V3). No account, no API keys, no build step, zero dependencies.

- [Option A — download a release zip](#option-a--download-a-release-zip)
- [Option B — from source (git)](#option-b--from-source-git)
- [First launch](#first-launch)
- [Using it](#using-it)
- [Updating](#updating)
- [Uninstalling](#uninstalling)
- [Troubleshooting](#troubleshooting)

---

## Requirements

- Chrome or Brave. Edge and other Chromium browsers generally work too, but only Chrome/Brave are tested.
- That's it — there is no `npm install`, no build, no configuration file to edit.

## Option A — download a release zip

1. Download the latest release: **[github.com/nullstacks/temp-mail-extension/releases/latest](https://github.com/nullstacks/temp-mail-extension/releases/latest)** — grab the `.zip` asset attached to it.
2. Unzip it. You should get a folder whose **root** contains `manifest.json`.
3. Continue at [First launch](#first-launch).

> Note: releases are cut manually and can lag behind the repo. If you want the very latest code, use Option B.

## Option B — from source (git)

```bash
git clone https://github.com/nullstacks/temp-mail-extension.git
```

Then continue at [First launch](#first-launch), selecting the cloned folder (`temp-mail-extension`) in step 3.

## First launch

1. Open the extensions page — type `chrome://extensions` in the address bar (`brave://extensions` in Brave).
2. Enable **Developer mode** (toggle, top-right corner).
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Pin the TempMail icon: click the puzzle-piece icon in the toolbar → pin **TempMail**. (Optional, but handy.)

Keep the original folder in place — loaded-unpacked extensions run from it. Don't delete the folder or move your clone after installing (if you do, **Load unpacked** the new location instead).

## Using it

- Click the toolbar icon → the popup shows an inbox. An address is **created automatically the first time you open it** — no signup.
- Press **Copy** to copy the address, or just fill a login form: the mini icon inside email fields fills them (read the [README](README.md) for the full feature list).
- Press **Change** to get a fresh address. Old addresses are kept in the popup's history (last 5) and can be switched back to.
- Prefer a different mail service? Settings → switch between **Catchmail** (catchmail.io / mailistry.com / zeppost.com, or your own domain via MX) and **temp.tf**. Provider changes apply to the *next* address; press **Get new address now** to apply immediately.
- The **⏸** button stops background polling and notifications until you resume.

Keyboard shortcuts: `Alt+Shift+F` — autofill the current page's form, `Alt+Shift+M` — open the popup. (Change them at `chrome://extensions/shortcuts`.)

## Updating

- **Release zip:** download the new zip, unzip, and make sure `manifest.json` is still at the folder root, then reload (next step). Easiest: update the *same* folder in place.
- **Git clone:** `git pull` inside the folder.
- **Reload the extension:** `chrome://extensions` → find TempMail → click the ↻ (reload) button. Your address, history and settings are preserved across updates; reloading only applies the code changes.

## Uninstalling

`chrome://extensions` → TempMail → **Remove**. All locally stored data (address, history, inbox) is deleted with it. Nothing was stored server-side under your name — Catchmail mailboxes are anonymous and create-only.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Error / could not create address" | Catchmail allows **1 request per second** — new addresses roll a random mailbox, so an occasional failure is normal. Wait a moment and press **Change** again. |
| `manifest.json` not found when loading | You selected the wrong folder (e.g. the zip's parent or an inner subfolder). Select the folder that *directly* contains `manifest.json`. |
| Icon doesn't fill forms | Check the mini-icon setting in Settings → Autofill, and confirm the page has a visible email field. Fields inside iframes are supported; tiny/hidden ones are ignored by design. |
| No new mail / badge stuck | Press **↻** in the popup to refresh manually. If you used **⏸**, resume first. Fast polling backs off and stops after 10 min with no mail — opening the popup resumes it. |
| temp.tf shows "error" for `.edu` address | `high.edu.pl` isn't in temp.tf's public API and can be refused — uncheck it in Settings, or keep Catchmail as the provider. |
| Extension "disabled" after browser update | Re-open `chrome://extensions`; if it was removed by a policy (e.g. work machine), reload via **Load unpacked** from your existing folder. |

Not available: Firefox (this is a Chromium MV3 extension; the browser-only APIs used differ in Gecko).
