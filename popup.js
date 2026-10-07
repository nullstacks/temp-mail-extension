const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { view: 'main', paused: false, current: null, messages: [], seen: new Set(), settings: null, openId: null, images: false };
const textCache = new Map();

/* ---------- helpers ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}
const ic = (n, c = 'ic') => `<svg class="${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
// Copy confirmation lives on the control itself (icon + label swap); a toast is the fallback
function flash(el) {
  el.setAttribute('data-done', '');
  const l = el.querySelector('.lbl');
  if (l) { if (!l.dataset.orig) l.dataset.orig = l.textContent; l.textContent = 'Copied'; }
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.removeAttribute('data-done'); if (l) l.textContent = l.dataset.orig; }, 1400);
}
async function copy(text, label = 'Copied', el = null) {
  try { await navigator.clipboard.writeText(text); el ? flash(el) : toast(label); }
  catch { toast('Copy failed'); }
}
function sinceText(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 8) return 'just now';
  if (s < 60) return Math.floor(s) + ' s ago';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  return Math.floor(s / 3600) + ' h ago';
}
function renderUpdated() {
  $('#updated').textContent = state.paused ? 'Paused' : state.lastCheck ? 'Checked ' + sinceText(state.lastCheck) : '';
}
const PROV_NAME = { catchmail: 'Catchmail', temptf: 'temp.tf', mygmail: 'MyGmail' };
const providerLabel = cur => PROV_NAME[TM.providerOf(cur)] + ' · ' + (String(cur.email).split('@')[1] || '');
function show(view) {
  state.view = view;
  for (const id of ['main', 'msg', 'settings']) $('#view-' + id).hidden = id !== view;
}
function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (isNaN(s)) return '';
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}
function senderName(from) {
  const m = String(from || '').match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);
  return m ? m[1].trim() || m[2] : (from || 'Unknown');
}
function bodyText(m) {
  const k = m.id + (m.partial ? 'p' : '');
  if (textCache.has(k)) return textCache.get(k);
  let t = m.body || '';
  if (m.bodyContentType === 'html') {
    const doc = new DOMParser().parseFromString(t, 'text/html');
    doc.querySelectorAll('style,script,head').forEach(n => n.remove());
    t = doc.body ? doc.body.textContent : '';
  }
  t = t.replace(/\s+/g, ' ').trim();
  textCache.set(k, t);
  return t;
}
function extractCodes(m) {
  const text = (m.subject || '') + ' ' + bodyText(m);
  const kw = /(code|otp|pin|passcode|verification|verify|security|token|one[- ]time)/i;
  const re = /\b\d{3}[ -]\d{3}\b|\b\d{4,8}\b/g;
  const out = new Set();
  let x;
  while ((x = re.exec(text))) {
    const ctx = text.slice(Math.max(0, x.index - 80), x.index + x[0].length + 40);
    if (kw.test(ctx)) out.add(x[0].replace(/[ -]/g, ''));
  }
  return [...out].slice(0, 3);
}
const codesCache = new Map();
function codesOf(m) {
  const k = m.id + (m.partial ? 'p' : '');
  if (!codesCache.has(k)) codesCache.set(k, extractCodes(m));
  return codesCache.get(k);
}
function extractLinks(m) {
  const found = [];
  if (m.bodyContentType === 'html') {
    const doc = new DOMParser().parseFromString(m.body || '', 'text/html');
    doc.querySelectorAll('a[href]').forEach(a => found.push({ href: a.getAttribute('href'), text: a.textContent }));
  } else {
    (String(m.body || '').match(/https?:\/\/[^\s<>"')]+/g) || []).forEach(h => found.push({ href: h, text: '' }));
  }
  const kw = /verif|confirm|activat|reset|magic|token|sign.?in|log.?in|validate|auth|password/i;
  const seen = new Set(), out = [];
  for (const l of found) {
    if (!/^https?:\/\//i.test(l.href) || seen.has(l.href)) continue;
    seen.add(l.href);
    if (kw.test(l.href) || kw.test(l.text)) out.push(l.href);
  }
  return out.slice(0, 3);
}

/* ---------- main view ---------- */
let shownAddr = null;
function renderEmail() {
  const c = state.current;
  const el = $('#email');
  if (c) { const i = c.email.lastIndexOf('@'); el.innerHTML = esc(c.email.slice(0, i)) + '<wbr>' + esc(c.email.slice(i)); } // prefer breaking at the @
  else el.textContent = '—';
  if (c && shownAddr && shownAddr !== c.email) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
  shownAddr = c ? c.email : null;
  if (!c) return;
  $('#provLine').textContent = providerLabel(c);
  const i = c.identity;
  $('#idName').textContent = i.full;
  const rows = [
    ['Name', i.full], ['Username', i.username], ['Password', i.password],
    ['Company', i.company],
    ['Gender', i.gender === 'female' ? 'Female' : 'Male'],
    ['Age / DOB', `${i.age} · ${String(i.dobD).padStart(2, '0')}/${String(i.dobM).padStart(2, '0')}/${i.dobY}`],
    ['Phone', i.phone], ['Phone (intl)', i.phoneIntl],
    ['Street', i.street], ['City', i.city], ['State', i.state],
    ['ZIP / PIN', i.zip], ['Country', i.country]
  ];
  $('#idBox').innerHTML = rows.map(([k, v]) =>
    `<div class="row kv" role="button" tabindex="0" data-v="${esc(v)}" title="Click to copy"><span class="k">${esc(k)}</span><span class="v${k === 'Password' ? ' mono' : ''}">${esc(v)}</span>${ic('copy', 'ic hint')}</div>`).join('');
}

let listSig = null;
function renderPause() {
  const b = $('#btnPause');
  b.innerHTML = ic(state.paused ? 'play' : 'pause');
  b.title = state.paused ? 'Resume auto-check' : 'Pause auto-check';
  b.setAttribute('aria-label', b.title);
  b.classList.toggle('on', state.paused);
  $('#pausedBar').hidden = !state.paused;
  renderUpdated();
}
async function setPaused(v) {
  state.paused = v;
  await TM.setPaused(v);
  renderPause();
  if (v) toast('Paused');
  else { toast('Resumed'); refresh(true); try { chrome.runtime.sendMessage({ type: 'boost' }); } catch (_) {} }
}

function renderList() {
  const list = $('#list');
  const sig = state.messages.map(m => m.id + (m.partial ? 'p' : '') + (state.seen.has(m.id) ? 'r' : 'u') + ago(m.date)).join('|');
  if (sig === listSig) return; // nothing visible changed: don't rebuild the DOM
  listSig = sig;
  const unread = state.messages.filter(m => !state.seen.has(m.id)).length;
  $('#count').textContent = state.messages.length ? `${state.messages.length} message${state.messages.length > 1 ? 's' : ''}${unread ? ` · ${unread} new` : ''}` : '';
  $('#empty').hidden = state.messages.length > 0;
  $('#btnReadAll').hidden = !unread;
  list.innerHTML = state.messages.map(m => {
    const codes = codesOf(m);
    const chips = codes.map(c => `<button class="code-chip" data-code="${esc(c)}" title="Copy code" aria-label="Copy code ${esc(c)}">${esc(c)}${ic('copy', 'ic i-copy')}${ic('check', 'ic i-check')}</button>`).join('');
    return `<li class="row${state.seen.has(m.id) ? '' : ' unread'}" data-id="${esc(m.id)}">
      <span class="dot"></span>
      <div class="li-body">
        <div class="li-top"><span class="from">${esc(senderName(m.from))}</span><span class="time">${esc(ago(m.date))}</span></div>
        <div class="subj">${esc(m.subject || '(no subject)')}</div>
        <div class="snip">${esc(bodyText(m).slice(0, 110))}</div>
        ${chips ? `<div class="codes">${chips}</div>` : ''}
      </div></li>`;
  }).join('');
}

async function refresh(manual = false) {
  const btn = $('#btnRefresh');
  if (manual) btn.classList.add('spin');
  try {
    const r = await TM.refreshInbox({ force: manual });
    if (r) { state.messages = r.messages; state.seen = await TM.getSeen(); }
    $('#status').hidden = true;
    if (r) { state.lastCheck = Date.now(); renderUpdated(); }
    if (state.openId === null) renderList();
  } catch (e) {
    $('#statusText').textContent = e.message;
    $('#status').hidden = false;
  } finally { btn.classList.remove('spin'); }
}

async function loadAll() {
  state.settings = await TM.getSettings();
  state.paused = await TM.isPaused(); renderPause();
  try {
    state.current = await TM.ensureEmail();
    $('#emailErr').hidden = true;
  } catch (e) {
    $('#emailErr').textContent = e.message;
    $('#emailErr').hidden = false;
    $('#email').textContent = 'No address yet';
    return;
  }
  renderEmail();
  state.seen = await TM.getSeen();
  const { inbox, inboxMeta } = await chrome.storage.session.get(['inbox', 'inboxMeta']);
  state.messages = inbox && inbox.email === state.current.email ? inbox.messages : [];
  if (inboxMeta && inboxMeta.email === state.current.email && !inboxMeta.error) state.lastCheck = inboxMeta.fetchedAt;
  renderUpdated();
  renderList();
  refresh();
  try { chrome.runtime.sendMessage({ type: 'boost' }); } catch (_) {}
}

/* ---------- message view ---------- */
function toBodyHtml(m) {
  if (m.bodyContentType === 'html') return String(m.body || '').replace(/<meta[^>]*>/gi, '');
  const safe = esc(m.body || '').replace(/(https?:\/\/[^\s<>&]+)/g, '<a href="$1">$1</a>');
  return `<pre style="white-space:pre-wrap;font:inherit;margin:0">${safe}</pre>`;
}
const blobToDataUrl = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });

async function inlineCids(m, html) {
  const map = m.inlineCids || {};
  const cids = [...new Set([...html.matchAll(/cid:([^"'\s)>]+)/gi)].map(x => x[1]))].slice(0, 12);
  for (const cid of cids) {
    const attId = map[cid] || map['<' + cid + '>'];
    if (!attId) continue;
    try {
      const blob = await TM.fetchAttachment(state.current.email, m.id, attId);
      if (blob.size > 3e6) continue;
      const url = await blobToDataUrl(blob);
      if (url) html = html.split('cid:' + cid).join(url);
    } catch (_) {}
  }
  return html;
}

async function renderFrame(m) {
  let html = toBodyHtml(m);
  const hasRemote = /<img[^>]+src=["']?\s*https?:|url\(\s*["']?https?:/i.test(html);
  $('#mImgBar').hidden = !hasRemote || state.images;
  html = await inlineCids(m, html);
  const imgSrc = state.images ? 'data: https: http:' : 'data:';
  $('#mFrame').srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:">
<base target="_blank">
<style>body{font:14px/1.5 system-ui,sans-serif;color:#111;background:#fff;margin:12px;word-break:break-word}img{max-width:100%;height:auto}a{color:#2563eb}</style>
</head><body>${html}</body></html>`;
}

function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

async function openMessage(id) {
  const m = state.messages.find(x => x.id === id);
  if (!m) return;
  state.openId = id; state.images = false;
  show('msg');
  $('#mSubject').textContent = m.subject || '(no subject)';
  $('#mFrom').textContent = 'From: ' + (m.from || 'unknown');
  $('#mDate').textContent = m.date ? new Date(m.date).toLocaleString() : '';
  $('#mCodes').innerHTML = ''; $('#mLinks').innerHTML = ''; $('#mAtt').innerHTML = ''; $('#mImgBar').hidden = true;
  state.seen.add(id);
  TM.markRead([id]);
  if (m.partial) { // list only had metadata: fetch the body now
    $('#mFrame').srcdoc = '<body style="font:13px system-ui;color:#888;margin:12px">Loading…</body>';
    try {
      const full = await TM.loadMessage(state.current.email, id);
      if (full) Object.assign(m, full, { id, partial: false });
    } catch (err) { toast('Could not load message: ' + err.message); }
    if (state.openId !== id) return; // user went back meanwhile
  }
  $('#mCodes').innerHTML = codesOf(m).map(c => `<button class="code-big" data-code="${esc(c)}" aria-label="Copy code ${esc(c)}"><span class="v">${esc(c)}</span><span class="act">${ic('copy', 'ic i-copy')}${ic('check', 'ic i-check')}<span class="lbl">Copy</span></span></button>`).join('');
  $('#mLinks').innerHTML = extractLinks(m).map(u => `<div class="row">${ic('link', 'ic lead')}<span class="u" title="${esc(u)}">${esc(u)}</span><button class="icon-btn sm" data-open="${esc(u)}" title="Open link" aria-label="Open link">${ic('arrow-up-right')}</button><button class="icon-btn sm" data-copyurl="${esc(u)}" title="Copy link" aria-label="Copy link">${ic('copy')}</button></div>`).join('');
  $('#mAtt').innerHTML = (m.attachments || []).map(a => `<div class="row">${ic('paperclip', 'ic lead')}<span class="u" title="${esc(a.name)}">${esc(a.name)}</span><span class="meta">${fmtSize(a.size || 0)}</span><button class="icon-btn sm" data-att="${esc(a.id)}" data-name="${esc(a.name)}" title="Download" aria-label="Download ${esc(a.name)}">${ic('download')}</button></div>`).join('');
  renderFrame(m);
}

function closeMessage() {
  state.openId = null;
  $('#mFrame').srcdoc = '';
  show('main');
  renderList();
}

/* ---------- settings ---------- */
const CM_DOMAINS = TM.CM_DOMAINS;
const ui = { provider: 'catchmail', domain: 'catchmail.io', custom: false };

function syncSettingsView() {
  $('#secCatchmail').hidden = ui.provider !== 'catchmail';
  $('#secMygmail').hidden = ui.provider !== 'mygmail';
  $('#secTemptf').hidden = ui.provider !== 'temptf';
  document.querySelectorAll('#provSeg .seg-btn').forEach(b => { const on = b.dataset.provider === ui.provider; b.classList.toggle('active', on); b.setAttribute('aria-checked', on); });
  document.querySelectorAll('#domOpts .opt-btn').forEach(b => {
    const d = b.dataset.domain;
    const on = d === '__custom' ? ui.custom : (!ui.custom && d === ui.domain);
    b.classList.toggle('active', on); b.setAttribute('aria-checked', on);
  });
  $('#sCmDomain').hidden = !ui.custom;
  $('#cmCustomHint').hidden = !ui.custom;
  // offer "new address" only when the current address doesn't match the selection
  const cur = state.current;
  let mismatch = false;
  if (cur) {
    const p = TM.providerOf(cur);
    if (p !== ui.provider) mismatch = true;
    else if (p === 'catchmail') {
      const dom = ui.custom ? ($('#sCmDomain').value || '').trim().toLowerCase() : ui.domain;
      mismatch = !!dom && !cur.email.toLowerCase().endsWith('@' + dom);
    } else if (p === 'mygmail') mismatch = TM.mgBase(cur.email) !== TM.mgBase($('#sMgEmail').value);
  }
  $('#applyHint').hidden = !mismatch;
}

// MyGmail: live examples from the typed address + guidance for the two switches
const MG_DEFAULT_STATUS = 'Your key is stored only in this browser.';
function setMgStatus(text, kind) { const el = $('#mgStatus'); el.textContent = text; el.className = 'footer' + (kind ? ' ' + kind : ''); }
function syncMgView() {
  const base = TM.mgBase($('#sMgEmail').value);
  const [local, domain] = base ? base.split('@') : ['you', 'gmail.com'];
  const gmail = /^(gmail|googlemail)\.com$/i.test(domain);
  const dotted = local.length > 3 ? local.slice(0, 1) + '.' + local.slice(1, 3) + '.' + local.slice(3) : local.split('').join('.');
  $('#mgPlusEx').textContent = `${local}+k3x9qm2@${domain}`;
  $('#mgDotEx').textContent = gmail ? `${dotted}@${domain}` : 'Only works for @gmail.com';
  $('#mgDot').disabled = !gmail;
  const plus = $('#mgPlus').checked, dot = $('#mgDot').checked && gmail;
  $('#mgStyleFoot').textContent = !plus && !dot
    ? 'Both off: your plain address is used, so this popup shows your whole inbox.'
    : 'Every new address is randomised from your email and lands in the same inbox. Only mail sent to that exact address appears here.';
}
const MG_PERM = () => ({ origins: [TM.MG_ORIGIN + '/*'] });
// Needs a user gesture: call it first thing inside a click handler
async function ensureMgAccess() { try { return await chrome.permissions.request(MG_PERM()); } catch (_) { return false; } }

function renderSettings() {
  const s = state.settings;
  ui.provider = ['catchmail', 'temptf', 'mygmail'].includes(s.provider) ? s.provider : 'catchmail';
  const dom = (s.catchmailDomain || 'catchmail.io').toLowerCase();
  ui.custom = !CM_DOMAINS.includes(dom);
  ui.domain = ui.custom ? 'catchmail.io' : dom;
  $('#sCmDomain').value = ui.custom ? dom : '';
  $('#sDot').checked = s.dot; $('#sPlus').checked = s.plus;
  $('#pGmail').checked = s.providers.gmail; $('#pOutlook').checked = s.providers.outlook; $('#pHotmail').checked = s.providers.hotmail; $('#pEdu').checked = !!s.providers.edu;
  $('#sIcon').checked = s.showIcon !== false;
  $('#sIdent').checked = s.fillIdentity; $('#sPass').checked = s.fillPassword;
  $('#sNotify').checked = s.notify;
  $('#sCountry').value = s.country; $('#sGender').value = s.gender;
  $('#sMinAge').value = s.minAge; $('#sMaxAge').value = s.maxAge; $('#sPoll').value = String(s.pollMinutes);
  $('#sMgKey').value = s.mygmailKey || ''; $('#sMgEmail').value = s.mygmailEmail || '';
  $('#mgPlus').checked = s.mgPlus !== false; $('#mgDot').checked = !!s.mgDot;
  setMgStatus(MG_DEFAULT_STATUS, '');
  syncMgView();
  syncSettingsView();
  renderHistory();
}
async function renderHistory() {
  const history = ((await chrome.storage.local.get('history')).history || []).slice(0, 5);
  $('#hist').innerHTML = history.length ? history.map(h => `<li class="row"><span class="e" title="${esc(h.email)}">${esc(h.email)}</span><button class="link" data-use="${esc(h.email)}">Use</button><button class="icon-btn sm" data-copyurl="${esc(h.email)}" title="Copy address" aria-label="Copy address">${ic('copy')}</button></li>`).join('')
    : '<li class="row none">None yet</li>';
}
async function saveSettings() {
  const s = state.settings;
  s.provider = ui.provider;
  s.mygmailKey = $('#sMgKey').value.trim();
  s.mygmailEmail = $('#sMgEmail').value.trim();
  s.mgPlus = $('#mgPlus').checked; s.mgDot = $('#mgDot').checked;
  s.catchmailDomain = ui.custom
    ? ($('#sCmDomain').value || '').trim().toLowerCase().replace(/^@/, '')
    : ui.domain;
  if (!s.catchmailDomain) s.catchmailDomain = 'catchmail.io';
  s.dot = $('#sDot').checked; s.plus = $('#sPlus').checked;
  s.providers = { gmail: $('#pGmail').checked, outlook: $('#pOutlook').checked, hotmail: $('#pHotmail').checked, edu: $('#pEdu').checked };
  if (!s.providers.gmail && !s.providers.outlook && !s.providers.hotmail && !s.providers.edu) {
    s.providers.gmail = true; $('#pGmail').checked = true; toast('At least one provider is required');
  }
  s.showIcon = $('#sIcon').checked;
  s.fillIdentity = $('#sIdent').checked; s.fillPassword = $('#sPass').checked;
  s.notify = $('#sNotify').checked;
  s.country = $('#sCountry').value; s.gender = $('#sGender').value;
  s.minAge = parseInt($('#sMinAge').value) || 22; s.maxAge = parseInt($('#sMaxAge').value) || 45;
  const poll = parseFloat($('#sPoll').value);
  const pollChanged = poll !== s.pollMinutes;
  s.pollMinutes = poll;
  await TM.saveSettings(s);
  if (pollChanged) { await TM.setupAlarm(); try { chrome.runtime.sendMessage({ type: 'rearm' }); } catch (_) {} }
}

/* ---------- events ---------- */
$('#email').onclick = () => state.current && copy(state.current.email, 'Email copied');
$('#btnCopy').onclick = e => state.current && copy(state.current.email, 'Email copied', e.currentTarget);

$('#btnNew').onclick = async e => {
  const b = e.currentTarget; b.disabled = true;
  try {
    state.current = await TM.newEmail();
    state.messages = []; state.seen = new Set();
    $('#emailErr').hidden = true;
    renderEmail(); renderList();
    toast('New address ready');
  } catch (err) {
    $('#emailErr').textContent = err.message; $('#emailErr').hidden = false;
  } finally { b.disabled = false; }
};

$('#btnFill').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return toast('No active tab');
    const n = await TM.autofill(tab.id);
    if (n) { toast(`Filled ${n} field${n > 1 ? 's' : ''}`); setTimeout(() => window.close(), 900); }
    else toast('No fillable fields found');
  } catch (e) { toast("Can't autofill on this page"); }
};

$('#btnRegen').onclick = async () => { state.current = await TM.regenIdentity(); renderEmail(); toast('New identity'); };
$('#idBox').onclick = e => { const r = e.target.closest('[data-v]'); if (r) copy(r.dataset.v, 'Copied'); };

$('#btnRefresh').onclick = () => refresh(true);
$('#btnPause').onclick = () => setPaused(!state.paused);
$('#btnResume').onclick = () => setPaused(false);
$('#btnReadAll').onclick = async () => {
  await TM.markRead(state.messages.map(m => m.id));
  state.seen = await TM.getSeen(); renderList();
};

$('#list').onclick = e => {
  const chip = e.target.closest('[data-code]');
  if (chip) { e.stopPropagation(); return copy(chip.dataset.code, 'Code copied', chip); }
  const li = e.target.closest('li[data-id]');
  if (li) openMessage(li.dataset.id);
};
$('#view-msg').onclick = async e => {
  const t = e.target.closest('[data-code],[data-open],[data-copyurl],[data-att]'); if (!t) return;
  if (t.dataset.code) copy(t.dataset.code, 'Code copied', t);
  else if (t.dataset.open) chrome.tabs.create({ url: t.dataset.open });
  else if (t.dataset.copyurl) copy(t.dataset.copyurl, 'Copied');
  else if (t.dataset.att) {
    try {
      const blob = await TM.fetchAttachment(state.current.email, state.openId, t.dataset.att);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = t.dataset.name || 'attachment';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) { toast('Download failed: ' + err.message); }
  }
};
$('#btnImgs').onclick = () => { state.images = true; renderFrame(state.messages.find(x => x.id === state.openId)); };
$('#btnBack').onclick = closeMessage;

$('#btnSettings').onclick = () => { renderSettings(); show('settings'); };
$('#btnBack2').onclick = () => { show(state.openId ? 'msg' : 'main'); };
document.querySelectorAll('#view-settings input, #view-settings select').forEach(el => el.onchange = async () => { await saveSettings(); syncMgView(); syncSettingsView(); });
$('#sCmDomain').oninput = () => { clearTimeout(window._domT); window._domT = setTimeout(async () => { await saveSettings(); syncSettingsView(); }, 400); };
$('#provSeg').onclick = async e => {
  const b = e.target.closest('[data-provider]'); if (!b) return;
  if (b.dataset.provider === 'mygmail' && !(await ensureMgAccess())) toast('MyGmail needs access to MailAPI to read your mail');
  ui.provider = b.dataset.provider; await saveSettings(); syncSettingsView();
};
$('#domOpts').onclick = async e => {
  const b = e.target.closest('[data-domain]'); if (!b) return;
  if (b.dataset.domain === '__custom') { ui.custom = true; syncSettingsView(); $('#sCmDomain').focus(); }
  else { ui.custom = false; ui.domain = b.dataset.domain; await saveSettings(); syncSettingsView(); }
};
$('#btnApply').onclick = async e => {
  const b = e.currentTarget; b.disabled = true;
  try {
    if (ui.provider === 'mygmail') await ensureMgAccess();
    await saveSettings();
    state.current = await TM.newEmail();
    state.messages = []; state.seen = new Set();
    $('#emailErr').hidden = true;
    renderEmail(); renderList(); syncSettingsView();
    toast('New address: ' + state.current.email.split('@')[1]);
  } catch (err) { toast(err.message); }
  finally { b.disabled = false; }
};
['#sMgKey', '#sMgEmail'].forEach(sel => $(sel).oninput = () => {
  setMgStatus(MG_DEFAULT_STATUS, ''); syncMgView();
  clearTimeout(window._mgT);
  window._mgT = setTimeout(async () => { await saveSettings(); syncSettingsView(); }, 400);
});
$('#mgSignup').onclick = e => { e.preventDefault(); chrome.tabs.create({ url: e.currentTarget.href }); };
$('#btnMgEye').onclick = e => {
  const k = $('#sMgKey'), show = k.type === 'password';
  k.type = show ? 'text' : 'password';
  e.currentTarget.innerHTML = ic(show ? 'eye-off' : 'eye');
  e.currentTarget.title = e.currentTarget.ariaLabel = show ? 'Hide key' : 'Show key';
};
$('#btnMgTest').onclick = async e => {
  const b = e.currentTarget; b.disabled = true;
  setMgStatus('Checking…', '');
  try {
    if (!(await ensureMgAccess())) throw new Error('Allow access to MailAPI to test the connection');
    await saveSettings();
    const r = await TM.mgTest();
    if (r.ok) setMgStatus(`Connected as ${r.email}. This address is ready to use.`, 'ok');
    else setMgStatus(`Your key works, but ${$('#sMgEmail').value.trim() || 'that address'} isn't linked to it. Linked: ${r.linked.join(', ')}.`, 'bad');
  } catch (err) { setMgStatus(err.message, 'bad'); }
  finally { b.disabled = false; }
};
$('#hist').onclick = async e => {
  const t = e.target.closest('[data-use],[data-copyurl]'); if (!t) return;
  if (t.dataset.copyurl) return copy(t.dataset.copyurl, 'Copied');
  if (t.dataset.use) {
    const entry = await TM.useAddress(t.dataset.use);
    if (entry) { await loadAll(); renderHistory(); toast('Switched address'); }
  }
};

chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'session' || !ch.inbox || !ch.inbox.newValue || !state.current) return;
  const v = ch.inbox.newValue;
  if (v.email !== state.current.email) return;
  state.messages = v.messages;
  TM.getSeen().then(seen => { state.seen = seen; if (state.openId === null) renderList(); });
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'session' && ch.inboxMeta && ch.inboxMeta.newValue && state.current) {
    const m = ch.inboxMeta.newValue;
    if (m.email === state.current.email && !m.error) { state.lastCheck = m.fetchedAt; renderUpdated(); }
  }
});

document.addEventListener('keydown', e => { // role="button" elements activate with Enter / Space
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('scroll', e => { // hairline under the toolbar once content scrolls beneath it
  const b = e.target;
  if (b.classList && b.classList.contains('body') && b.previousElementSibling) b.previousElementSibling.classList.toggle('scrolled', b.scrollTop > 2);
}, true);
setInterval(renderUpdated, 5000);

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.paused && !!ch.paused.newValue !== state.paused) { state.paused = !!ch.paused.newValue; renderPause(); }
});

loadAll();
setInterval(() => { if (!state.paused && state.openId === null && !$('#view-main').hidden) refresh(); }, 10000);
