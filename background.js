// Nullstacks Temp Mail — MV3 service worker (temp.tf API)
// One address stays in chrome.storage as "primary" until the user presses Change.
const API = "https://temp.tf/api";

// ---------- storage helpers ----------
const getPrefs = (d = {}) => new Promise((res) => chrome.storage.local.get(d, (v) => res({ ...d, ...v })));
const setPrefs = (o) => new Promise((res) => chrome.storage.local.set(o, res));

function sendTab(tabId, msg) {
  return new Promise((res) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (r) => { void chrome.runtime.lastError; res(r ?? null); });
    } catch { res(null); }
  });
}
function sendTabGently(tabId, msg) {
  // assumes tab exists and may not have the content script; resolves null on failure
  return sendTab(tabId, msg);
}

// ---------- timeAgo ----------
function timeAgo(iso) {
  try {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  } catch { return ""; }
}

// ---------- api client ----------
let rateLimitedUntil = 0;
const inFlight = new Map();

function backoff(retryAfter) {
  rateLimitedUntil = Date.now() + (Number(retryAfter) || 15) * 1000 + 1000;
}

async function apiFetch(path, opts = {}) {
  const key = (opts.method || "GET") + " " + path;
  if (Date.now() < rateLimitedUntil) {
    const err = new Error("Rate limited — retry in " + Math.ceil((rateLimitedUntil - Date.now()) / 1000) + "s");
    err.code = 429;
    throw err;
  }
  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => {
    const headers = {};
    if (opts.body) headers["Content-Type"] = "application/json";
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(API + path, {
        method: opts.method || "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      if (r.status === 429) { backoff(r.headers.get("Retry-After")); const e = new Error("Rate limited (429)"); e.code = 429; throw e; }
      if (!r.ok) { const e = new Error("temp.tf error " + r.status); e.code = r.status; throw e; }
      return await r.json();
    } finally {
      clearTimeout(to);
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

// ---------- providers ----------
const PROVIDER_DOMAINS = { gmail: "gmail.com", outlook: "outlook.com", hotmail: "hotmail.com" };

// ---------- account state ----------
async function getState() {
  const v = await getPrefs({ primary: null, saved: [], generatorMode: "random+plus", generatorProvider: "any" });
  return v;
}

// mode: random+plus | dot | plus | dot+plus | clear
async function newAddress(mode, provider) {
  const params = new URLSearchParams();
  if (mode === "dot" || mode === "dot+plus") params.set("dot", "1");
  if (mode === "plus" || mode === "dot+plus" || mode === "random+plus") params.set("plus", "1");
  const prov = provider || "any";
  if (prov !== "any") params.set("providers", prov);
  const j = await apiFetch("/account?" + params.toString());
  if (!j.email) throw new Error("temp.tf returned no address");
  return j.email;
}

async function setPrimary(email, meta) {
  const prev = await getPrefs({ primary: null });
  const entry = { email, createdAt: Date.now(), mode: meta?.mode || "", source: temp_ff_source(email) };
  const saved = prev.primary
    ? [...(await getState()).saved, {
        email: prev.primary.email,
        createdAt: prev.primary.createdAt || Date.now(),
        removedAt: Date.now(),
        messages: 0
      }].slice(-10)
    : (await getState()).saved;
  await setPrefs({ primary: entry, saved, fillCount: 0 });
  return entry;
}

// a local tag so the popup can show what kind of address this is
function temp_ff_source(email) {
  if (!email) return "unknown";
  const d = email.split("@")[1] || "";
  if (d === "gmail.com") return "gmail alias";
  if (d === "outlook.com") return "outlook alias";
  if (d === "hotmail.com") return "hotmail alias";
  return "temp.tf (" + d + ")";
}

// ---------- inbox cache + dedupe ----------
const inboxCache = new Map(); // email -> { messages, ts }

async function checkInbox(email, { silent } = {}) {
  if (!email) throw new Error("No address yet — press New first");
  const j = await apiFetch("/check", { method: "POST", body: { email } });
  const messages = (j.data || []).map((m, i) => normalizeMsg(m, i));
  const prevIds = new Set((inboxCache.get(email)?.messages || []).map((m) => m.id));
  const newOnes = messages.filter((m) => !prevIds.has(m.id));

  // persistent dedupe so notifications don't refire after SW restart
  const all = await getPrefs({ seenIds: {} });
  const seen = new Set(all.seenIds[email] || []);
  const isFirstRun = !all.seenIds.hasOwnProperty(email);
  const notifOnes = isFirstRun ? [] : newOnes.filter((m) => !seen.has(m.id));
  for (const m of newOnes) seen.add(m.id);

  inboxCache.set(email, { messages, ts: Date.now() });
  const seenIds = { ...all.seenIds, [email]: [...seen].slice(-500) };
  await setPrefs({ seenIds });

  const payload = { messages, newCount: isFirstRun ? 0 : newOnes.length, newMessages: notifOnes, firstRun: isFirstRun };
  if (!silent && notifOnes.length) notifyNew(notifOnes, email);
  return payload;
}

function normalizeMsg(m, i) {
  return {
    id: String(m.id ?? i),
    subject: m.subject || "(no subject)",
    from: m.from || "",
    date: m.date || "",
    body: m.body || "",
    bodyContentType: m.bodyContentType || "text",
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    inlineCids: m.inlineCids || {},
    preview: (m.body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140),
    ago: timeAgo(m.date)
  };
}

// ---------- notifications ----------
function notifyNew(msgs, email) {
  for (const m of msgs.slice(-3)) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "New mail: " + m.subject,
      message: "From " + m.from + "\nClick the toolbar icon to read it.",
      silent: false
    });
  }
}

// ---------- polling ----------
async function pollPrimary() {
  const { primary } = await getState();
  if (!primary) return;
  try { await checkInbox(primary.email, { silent: false }); } catch { /* rate limit / offline */ }
}

chrome.alarms.create("poll", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "poll") pollPrimary(); });

chrome.runtime.onInstalled.addListener(async () => {
  void chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "tm-fill-email", title: "Fill with temp mail (popup address)", contexts: ["editable"] });
    chrome.contextMenus.create({ id: "tm-copy", title: "Copy temp mail address", contexts: ["editable"] });
  });
});
chrome.runtime.onStartup.addListener(() => {});

// ---------- context menus ----------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { primary } = await getState();
  if (!primary || !tab?.id) return;
  if (info.menuItemId === "tm-copy") {
    // clipboard write is only reliable in a focused page context → delegate to content script
    const r = await sendTab(tab.id, { type: "copyToClipboard", text: primary.email });
    if (!r?.ok) sendTab(tab.id, { type: "toast", text: "Could not copy — open the popup and press Copy" });
  } else {
    sendTab(tab.id, { type: "fill", email: primary.email });
  }
});

// keyboard shortcut (Alt+Shift+E default): fill email into the focused field
chrome.commands?.onCommand.addListener(async (cmd) => {
  if (cmd !== "fill-email") return;
  const { primary } = await getState();
  if (!primary) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) sendTab(tab.id, { type: "fill", email: primary.email });
});

// ---------- message router ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "getState": {
          const st = await getState();
          const cached = st.primary ? inboxCache.get(st.primary.email) : null;
          sendResponse({ ok: true, ...st, inbox: cached?.messages || [], inboxTs: cached?.ts || 0 });
          break;
        }
        case "newAddress": {
          const st = await getState();
          const email = await newAddress(msg.mode || st.generatorMode, msg.provider || st.generatorProvider);
          const entry = await setPrimary(email, { mode: msg.mode || st.generatorMode });
          const inbox = await checkInbox(email, { silent: true });
          sendResponse({ ok: true, primary: entry, inbox: inbox.messages });
          break;
        }
        case "customAddress": {
          const em = String(msg.email || "").trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { sendResponse({ ok: false, error: "Invalid email" }); break; }
          const entry = await setPrimary(em, { mode: "custom" });
          const inbox = await checkInbox(em, { silent: true }).catch(() => ({ messages: [] }));
          sendResponse({ ok: true, primary: entry, inbox: inbox.messages || [] });
          break;
        }
        case "check": {
          const st = await getState();
          const r = await checkInbox(msg.email || st.primary?.email, { silent: !!msg.silent });
          sendResponse({ ok: true, ...r });
          break;
        }
        case "fill": {
          const st = await getState();
          if (!st.primary) { sendResponse({ ok: false, error: "No address" }); break; }
          const r = await sendTabGently(msg.tabId, { type: "fill", email: st.primary.email });
          sendResponse(r ?? { ok: false, error: "No content script on page" });
          break;
        }
        case "contentFill": {
          const st = await getState();
          if (!st.primary) { sendResponse({ ok: false }); break; }
          sendResponse({ ok: true, email: st.primary.email });
          break;
        }
        case "copy": {
          const st = await getState();
          if (!st.primary) { sendResponse({ ok: false, error: "No address" }); break; }
          // delegate to the active tab's focused page for a reliable clipboard write
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          let done = false;
          if (tab?.id) {
            const r = await sendTab(tab.id, { type: "copyToClipboard", text: st.primary.email });
            done = !!r?.ok;
          }
          if (!done) {
            // fallback: background write (works in Chrome 120+ when SW is focused; harmless otherwise)
            try { await navigator.clipboard.writeText(st.primary.email); done = true; } catch { /* ignore */ }
          }
          sendResponse({ ok: done });
          break;
        }
        case "savePrefs": {
          const o = {};
          if (typeof msg.mode === "string") o.generatorMode = msg.mode;
          if (typeof msg.provider === "string") o.generatorProvider = msg.provider;
          await setPrefs(o);
          sendResponse({ ok: true });
          break;
        }
        case "updateBadge": {
          const st = await getState();
          const unread = msg.unread ?? 0;
          await chrome.action.setBadgeText({ text: unread > 0 ? String(unread > 99 ? "99+" : unread) : "" });
          await chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
          sendResponse({ ok: true });
          break;
        }
        case "openMessage": {
          // open the temp.tf mailbox web view as fallback for heavy HTML rendering
          const st = await getState();
          const url = "https://temp.tf/";
          await chrome.tabs.create({ url });
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e), code: e.code || 0 });
    }
  })();
  return true; // keep channel open
});
