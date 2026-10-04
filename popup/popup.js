// Nullstacks Temp Mail — popup logic
const $ = (id) => document.getElementById(id);

const state = {
  primary: null,
  inbox: [],
  inboxTs: 0,
  currentMsg: null,
  view: "inbox",
  otpCode: null,
};

// ---------- messaging ----------
function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, (r) => {
    void chrome.runtime.lastError;
    res(r || { ok: false, error: "no response" });
  }));
}

// ---------- status ----------
let statusTimer = null;
function status(text, cls = "") {
  const el = $("status");
  el.textContent = text || "";
  el.className = cls;
  clearTimeout(statusTimer);
  if (text) statusTimer = setTimeout(() => { el.textContent = ""; el.className = ""; }, 6000);
}

// ---------- render ----------
function renderEmail() {
  const el = $("email");
  if (state.primary) {
    el.textContent = state.primary.email;
    el.className = "";
    el.title = "Created " + new Date(state.primary.createdAt).toLocaleString() + " — stays constant until you press Change";
    $("copy").disabled = false;
  } else {
    el.textContent = "no address yet — press New";
    el.className = "empty";
    el.title = "";
    $("copy").disabled = true;
  }
}

function renderInbox() {
  const list = $("list");
  const un = state.inbox.length;
  $("inboxTitle").innerHTML = un
    ? `Inbox <span class="unread-dot">· ${un} mail${un > 1 ? "s" : ""}</span>`
    : "Inbox";

  if (state.view === "msg") return; // message view replaces the list

  list.style.display = "";
  if (!state.inbox.length) {
    list.innerHTML = `<div class="empty-state">No mail yet.<br /><b>Give the address a minute</b> — new mail appears automatically.</div>`;
    return;
  }
  list.innerHTML = state.inbox.map((m) => `
    <div class="msg" data-id="${esc(m.id)}">
      <div class="top">
        <span class="from">${esc(m.from || "(unknown sender)")}</span>
        <span class="when">${esc(m.ago || "")}</span>
      </div>
      <div class="subj">${esc(m.subject)}</div>
      <div class="prev">${esc(m.preview || "")}</div>
      ${m.attachments?.length ? `<div class="hasatt">📎 ${m.attachments.length} attachment${m.attachments.length > 1 ? "s" : ""}</div>` : ""}
    </div>
  `).join("");
  list.querySelectorAll(".msg").forEach((el) => {
    el.addEventListener("click", () => openMsg(el.dataset.id));
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderAll() {
  renderEmail();
  renderInbox();
}

// ---------- message view ----------
function extractOtp(text) {
  if (!text) return null;
  const patterns = [
    /\b(\d{3}[\s-]?\d{3})\b/,          // 123 456 / 123-456
    /\b(\d{4,8})\b/,                   // 4-8 digits
    /\b([A-Z0-9]{5,8})\b/              // alphanum codes like AB12CD
  ];
  const kw = /(code|otp|verification|verify|pin|password|2fa|confirm)/i;
  // prefer a code near a keyword
  const windowRe = new RegExp("(?:^|[^\\w])((?:\\w{4,8}))[^.!?]{0,60}(?:^|\\w)" , "i");
  const m1 = text.match(new RegExp("(?:code|otp|pin|2fa)[^0-9A-Z]{0,20}([0-9]{4,8})", "i"));
  if (m1) return m1[1].replace(/[\s-]/g, "");
  const m2 = text.match(/\b([0-9]{3}[\s-]?[0-9]{3})\b/);
  if (m2) return m2[1].replace(/[\s-]/g, "");
  const m3 = text.match(/\b([0-9]{4,8})\b/);
  if (m3) return m3[1];
  return null;
}

function openMsg(id) {
  const m = state.inbox.find((x) => x.id === id);
  if (!m) return;
  state.currentMsg = m;
  state.view = "msg";
  $("list").style.display = "none";
  $("msgView").classList.add("show");
  $("mvSubject").textContent = m.subject;
  const src = m.bodyContentType === "html" ? stripHtml(m.body) : m.body;
  state.otpCode = extractOtp(src);
  $("mvMeta").textContent = `From ${m.from || "unknown"} · ${m.ago || m.date}`;
  const hasOtp = !!state.otpCode;
  $("mvCopyOtp").style.display = hasOtp ? "" : "none";
  if (hasOtp) {
    $("mvCopyOtp").textContent = "⧉ Copy code " + state.otpCode;
  }
  const body = $("msgBody");
  body.innerHTML = "";
  if (m.bodyContentType === "html" && m.body) {
    // sandboxed iframe, no scripts — safe HTML mail rendering
    const ifr = document.createElement("iframe");
    ifr.sandbox = "allow-same-origin";
    ifr.style.height = "240px";
    body.appendChild(ifr);
    const doc = ifr.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>
      body{font:13px/1.5 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:#111;margin:12px;}
      a{color:#0e7490;} img{max-width:100%;}
    </style></head><body>${m.body}</body></html>`);
    doc.close();
    ifr.onload = () => { try { ifr.style.height = Math.min(600, ifr.contentDocument.body.scrollHeight + 24) + "px"; } catch {} };
  } else {
    const pre = document.createElement("div");
    pre.style.whiteSpace = "pre-wrap";
    pre.textContent = m.body || "(empty)";
    body.appendChild(pre);
  }
  // attachments list
  if (m.attachments?.length) {
    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    for (const a of m.attachments) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.style.cssText = "margin:3px 4px 0 0;font-size:10.5px;padding:5px 8px;display:inline-flex";
      btn.textContent = "⬇ " + a.name + " (" + fmtSize(a.size) + ")";
      btn.addEventListener("click", () => downloadAttachment(m, a));
      wrap.appendChild(btn);
    }
    body.appendChild(wrap);
  }
  render();
}

function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent || "";
}
function fmtSize(n) {
  if (!n) return "?";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

function downloadAttachment(m, a) {
  const email = state.primary?.email;
  if (!email) { status("No address", "err"); return; }
  const url = `https://temp.tf/api/attachment?email=${encodeURIComponent(email)}&messageId=${encodeURIComponent(m.id)}&attachmentId=${encodeURIComponent(a.id)}`;
  if (chrome.downloads?.download) {
    chrome.downloads.download({ url, filename: a.name || "attachment" });
    status("Downloading " + (a.name || "attachment"), "ok");
  } else {
    chrome.tabs.create({ url });
  }
}

function backToInbox() {
  state.view = "inbox";
  $("msgView").classList.remove("show");
  $("list").style.display = "";
  state.currentMsg = null;
  renderInbox();
}

// ---------- data ----------
async function refresh(silent = false) {
  if (!silent) $("sync").textContent = "⟳ …";
  const r = await send({ type: "check", silent: true });
  if (r.ok) {
    state.inbox = r.messages || [];
    state.inboxTs = Date.now();
    if (r.primary) state.primary = r.primary;
    $("pollInfo").textContent = "updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } else if (!silent) {
    status("Refresh failed: " + (r.error || "?"), "err");
  }
  $("sync").textContent = "⟳ refresh";
  renderAll();
}

async function loadState() {
  const r = await send({ type: "getState" });
  if (r.ok) {
    state.primary = r.primary;
    state.inbox = r.inbox || [];
    state.inboxTs = r.inboxTs || 0;
    if (r.generatorMode) $("mode").value = r.generatorMode;
    if (r.generatorProvider) $("prov").value = r.generatorProvider;
    state.savedRef = r.saved || [];
    renderHistory();
  }
  renderAll();
  if (state.primary) refresh(true);
}

// ---------- actions ----------
$("new").addEventListener("click", async () => {
  $("new").disabled = true;
  status("Generating address…");
  const r = await send({ type: "newAddress", mode: $("mode").value, provider: $("prov").value });
  $("new").disabled = false;
  if (r.ok) {
    state.primary = r.primary;
    state.inbox = r.inbox || [];
    status("New address ready", "ok");
    renderAll();
  } else {
    status("Failed: " + (r.error || "?"), "err");
  }
});

$("change").addEventListener("click", async () => {
  $("change").disabled = true;
  status("Generating new address…");
  const r = await send({ type: "newAddress", mode: $("mode").value, provider: $("prov").value });
  $("change").disabled = false;
  if (r.ok) {
    state.primary = r.primary;
    state.inbox = r.inbox || [];
    status("Address changed — old one is in History", "ok");
    renderAll();
  } else {
    status("Failed: " + (r.error || "?"), "err");
  }
});

$("customSet").addEventListener("click", async () => {
  const em = $("customEmail").value.trim();
  if (!em) return;
  const r = await send({ type: "customAddress", email: em });
  if (r.ok) {
    state.primary = r.primary;
    state.inbox = r.inbox || [];
    status("Address set", "ok");
    renderAll();
  } else {
    status(r.error || "Failed", "err");
  }
});

$("copy").addEventListener("click", async () => {
  const r = await send({ type: "copy" });
  if (r.ok) {
    status("Copied to clipboard", "ok");
  } else {
    // last-resort: popup has its own user gesture, write directly
    try {
      await navigator.clipboard.writeText(state.primary.email);
      status("Copied to clipboard", "ok");
    } catch {
      status("Copy failed", "err");
    }
  }
});

$("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { status("No active tab", "err"); return; }
  const r = await send({ type: "fill", tabId: tab.id });
  if (!r?.ok && !state.primary) status("No address — press New first", "err");
});

$("sync").addEventListener("click", () => refresh(false));

$("mode").addEventListener("change", async () => {
  await send({ type: "savePrefs", mode: $("mode").value });
  status("Generator mode saved", "ok");
});
$("prov").addEventListener("change", async () => {
  await send({ type: "savePrefs", provider: $("prov").value });
  status("Provider saved", "ok");
});

$("mvBack").addEventListener("click", backToInbox);

// custom address toggle
$("customToggle").addEventListener("click", () => {
  const row = $("customRow");
  row.classList.toggle("show");
  if (row.classList.contains("show")) $("customEmail").focus();
});

$("customEmail").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("customSet").click();
});

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

$("mvCopyBody").addEventListener("click", async () => {
  if (!state.currentMsg) return;
  const m = state.currentMsg;
  const text = m.bodyContentType === "html" ? stripHtml(m.body) : m.body;
  const ok = await copyToClipboard(text);
  status(ok ? "Body copied" : "Copy failed", ok ? "ok" : "err");
});

$("mvCopyOtp").addEventListener("click", async () => {
  if (!state.otpCode) return;
  const ok = await copyToClipboard(state.otpCode);
  status(ok ? "Code " + state.otpCode + " copied" : "Copy failed", ok ? "ok" : "err");
});

// savePrefs handler exists in background; keyboard fill shortcut hint
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.view === "msg") backToInbox();
});

// ---------- live updates while popup is open ----------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.primary) {
    state.primary = changes.primary.newValue;
    renderEmail();
  }
  if (changes.saved) state.savedRef = changes.saved.newValue || [];
  if (changes.primary || changes.saved) renderHistory();
});

// poll lightweightly while open
setInterval(() => { if (state.view === "inbox") { refresh(true).then(updateBadge); } }, 10000);

loadState();
