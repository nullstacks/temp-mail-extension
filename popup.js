const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { current: null, messages: [], seen: new Set(), settings: null, openId: null, images: false };
const textCache = new Map();

/* ---------- helpers ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}
async function copy(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); }
  catch { toast('Copy failed'); }
}
function show(view) {
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
  if (textCache.has(m.id)) return textCache.get(m.id);
  let t = m.body || '';
  if (m.bodyContentType === 'html') {
    const doc = new DOMParser().parseFromString(t, 'text/html');
    doc.querySelectorAll('style,script,head').forEach(n => n.remove());
    t = doc.body ? doc.body.textContent : '';
  }
  t = t.replace(/\s+/g, ' ').trim();
  textCache.set(m.id, t);
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
function renderEmail() {
  const c = state.current;
  $('#email').textContent = c ? c.email : '—';
  if (!c) return;
  const i = c.identity;
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
    `<div class="idrow" data-v="${esc(v)}" title="Click to copy"><span>${esc(k)}</span><code>${esc(v)}</code></div>`).join('');
}

function renderList() {
  const list = $('#list');
  const unread = state.messages.filter(m => !state.seen.has(m.id)).length;
  $('#count').textContent = state.messages.length ? `${state.messages.length} message${state.messages.length > 1 ? 's' : ''}${unread ? ` · ${unread} new` : ''}` : '';
  $('#empty').hidden = state.messages.length > 0;
  list.innerHTML = state.messages.map(m => {
    const codes = extractCodes(m);
    return `<li data-id="${esc(m.id)}" class="${state.seen.has(m.id) ? '' : 'unread'}">
      <span class="dot"></span>
      <div class="li-body">
        <div class="li-top"><span class="from">${esc(senderName(m.from))}</span><span class="time">${esc(ago(m.date))}</span></div>
        <div class="subj">${esc(m.subject || '(no subject)')}</div>
        <div class="snip">${esc(bodyText(m).slice(0, 110))}</div>
        ${codes.map(c => `<button class="code-chip" data-code="${esc(c)}" title="Copy code">${esc(c)}</button>`).join('')}
      </div></li>`;
  }).join('');
}

async function refresh(manual = false) {
  const btn = $('#btnRefresh');
  if (manual) btn.classList.add('spin');
  try {
    const r = await TM.refreshInbox();
    if (r) { state.messages = r.messages; state.seen = await TM.getSeen(); }
    $('#status').hidden = true;
    if (state.openId === null) renderList();
  } catch (e) {
    $('#status').textContent = '⚠ ' + e.message;
    $('#status').hidden = false;
  } finally { btn.classList.remove('spin'); }
}

async function loadAll() {
  state.settings = await TM.getSettings();
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
  const { inbox } = await chrome.storage.session.get('inbox');
  state.messages = inbox && inbox.email === state.current.email ? inbox.messages : [];
  renderList();
  refresh();
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
  $('#mCodes').innerHTML = extractCodes(m).map(c => `<button class="chip" data-code="${esc(c)}" title="Copy code">${esc(c)} · copy</button>`).join('');
  $('#mLinks').innerHTML = extractLinks(m).map(u => `<div class="linkrow"><span class="u" title="${esc(u)}">${esc(u)}</span><button class="mini" data-open="${esc(u)}">Open</button><button class="mini" data-copyurl="${esc(u)}">Copy</button></div>`).join('');
  $('#mAtt').innerHTML = (m.attachments || []).map(a => `<div class="att"><span>📎 ${esc(a.name)} <span class="muted">(${fmtSize(a.size || 0)})</span></span><button class="mini" data-att="${esc(a.id)}" data-name="${esc(a.name)}">Download</button></div>`).join('');
  renderFrame(m);
  state.seen.add(id);
  await TM.markRead([id]);
}

function closeMessage() {
  state.openId = null;
  $('#mFrame').srcdoc = '';
  show('main');
  renderList();
}

/* ---------- settings ---------- */
function renderSettings() {
  const s = state.settings;
  $('#sProvider').value = s.provider || 'catchmail';
  $('#sCmDomain').value = s.catchmailDomain || 'catchmail.io';
  $('#cmRow').hidden = ($('#sProvider').value !== 'catchmail');
  $('#cmDomainRow').hidden = ($('#sProvider').value !== 'catchmail');
  $('#tfNote').hidden = ($('#sProvider').value === 'catchmail');
  $('#sDot').checked = s.dot; $('#sPlus').checked = s.plus;
  $('#pGmail').checked = s.providers.gmail; $('#pOutlook').checked = s.providers.outlook; $('#pHotmail').checked = s.providers.hotmail; $('#pEdu').checked = !!s.providers.edu;
  $('#sIcon').checked = s.showIcon !== false;
  $('#sIdent').checked = s.fillIdentity; $('#sPass').checked = s.fillPassword;
  $('#sNotify').checked = s.notify;
  $('#sCountry').value = s.country; $('#sGender').value = s.gender;
  $('#sMinAge').value = s.minAge; $('#sMaxAge').value = s.maxAge; $('#sPoll').value = String(s.pollMinutes);
  renderHistory();
}
async function renderHistory() {
  const history = ((await chrome.storage.local.get('history')).history || []).slice(0, 5);
  $('#hist').innerHTML = history.length ? history.map(h => `<li><span class="e" title="${esc(h.email)}">${esc(h.email)}</span><button class="mini" data-use="${esc(h.email)}">Use</button><button class="mini" data-copyurl="${esc(h.email)}">Copy</button></li>`).join('')
    : '<li class="muted">None yet</li>';
}
async function saveSettings() {
  const s = state.settings;
  s.provider = $('#sProvider').value;
  s.catchmailDomain = ($('#sCmDomain').value || 'catchmail.io').trim().toLowerCase();
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
  if (pollChanged) await TM.setupAlarm();
}

/* ---------- events ---------- */
$('#email').onclick = () => state.current && copy(state.current.email, 'Email copied');
$('#btnCopy').onclick = () => state.current && copy(state.current.email, 'Email copied');

$('#btnNew').onclick = async e => {
  const b = e.currentTarget; b.disabled = true; b.textContent = '…';
  try {
    state.current = await TM.newEmail();
    state.messages = []; state.seen = new Set();
    $('#emailErr').hidden = true;
    renderEmail(); renderList();
    toast('New address ready');
  } catch (err) {
    $('#emailErr').textContent = err.message; $('#emailErr').hidden = false;
  } finally { b.disabled = false; b.textContent = 'Change'; }
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
$('#btnReadAll').onclick = async () => {
  await TM.markRead(state.messages.map(m => m.id));
  state.seen = await TM.getSeen(); renderList();
};

$('#list').onclick = e => {
  const chip = e.target.closest('[data-code]');
  if (chip) { e.stopPropagation(); return copy(chip.dataset.code, 'Code copied'); }
  const li = e.target.closest('li[data-id]');
  if (li) openMessage(li.dataset.id);
};
$('#view-msg').onclick = async e => {
  const t = e.target;
  if (t.dataset.code) copy(t.dataset.code, 'Code copied');
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
document.querySelectorAll('#view-settings input, #view-settings select').forEach(el => el.onchange = saveSettings);
$('#hist').onclick = async e => {
  const t = e.target;
  if (t.dataset.copyurl) return copy(t.dataset.copyurl, 'Copied');
  if (t.dataset.use) {
    const entry = await TM.useAddress(t.dataset.use);
    if (entry) { await loadAll(); renderHistory(); toast('Switched address'); }
  }
};

loadAll();
setInterval(() => { if (state.openId === null && !$('#view-main').hidden) refresh(); }, 10000);
