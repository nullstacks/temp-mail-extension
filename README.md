# TempMail (Chrome / Brave, Manifest V3)

Install: open `chrome://extensions` (or `brave://extensions`) → enable **Developer mode** → **Load unpacked** → select this folder.

Features
- Same address persists across tabs, sessions and browser restarts until you press **Change**
- Always-visible mini email icon inside every email field (click = fill email, Shift+click = autofill whole form; toggle in Settings)
- Copy / Change / **Autofill form** (email, name, username, password, gender, age/DOB, phone, address, city, state, ZIP/PIN, country — incl. dropdowns & radios)
- Fake identity generator: US, India, UK, Canada, Australia, Germany (city/state/postcode stay consistent)
- Background inbox polling + unread badge + desktop notifications
- OTP code chips (one-click copy) and verification-link detection
- Safe message viewer (sandboxed, remote images blocked until you allow), inline images, attachment download
- Right-click menu on any field; shortcuts Alt+Shift+F (autofill), Alt+Shift+M (open popup)
- **Pause button** (⏸ in the popup header): stops all automatic inbox checks, background wake-ups and notifications until you resume; the ↻ button still refreshes manually
- Settings: provider-aware UI — Catchmail shows a domain picker (catchmail.io / mailistry.com / zeppost.com / custom MX), temp.tf shows Gmail / Outlook / Hotmail + dot / plus aliases; poll interval; history of previous addresses

## Performance notes (1.3.1)

- **Catchmail polling:** the message list is fetched each poll, but full bodies are fetched only once per message (newest first, 3 per poll) and cached — previously every poll re-downloaded every message. All Catchmail calls are spaced ≥1.05 s apart to respect the 1 req/s limit. Bodies not yet fetched are loaded on demand when you open the message.
- **One poller:** the service worker polls; the popup reads the shared result and live-updates from storage instead of making its own requests. Concurrent refreshes share a single request.
- **Storage:** the inbox is rewritten only when it changes; an unchanged poll writes a ~100-byte record. Settings are cached in memory.
- **Backoff / idle:** fast polling backs off exponentially on errors and stops after 10 min with no new mail (the 30 s alarm continues); opening the popup or receiving mail resumes it.
- **Content script:** no work until an email field exists; only fields inside the viewport are measured (IntersectionObserver); DOM changes are scanned incrementally (added nodes only); layout reads/writes are batched; no timers run while no email field is on screen; tiny iframes are skipped; turning the icon off detaches everything.
