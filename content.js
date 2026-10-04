/* TempMail: always-visible mini envelope icon inside email fields. Click = fill temp email. Shift+click = autofill whole form. */
(() => {
  if (window.__tmIconLoaded) return;
  window.__tmIconLoaded = true;

  let email = null, enabled = true, dead = false;
  const tracked = new Map(); // input -> button
  const SIZE = 22;

  /* ---------- overlay (closed shadow root so page CSS/JS can't touch it) ---------- */
  const host = document.createElement('tempmail-icons');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  const CSS = `button{all:initial;position:fixed;top:0;left:0;width:${SIZE}px;height:${SIZE}px;border-radius:50%;
      background:#4f46e5;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;pointer-events:auto;
      display:none;align-items:center;justify-content:center;opacity:.92;transition:transform .12s,opacity .12s,background .2s}
    button:hover{opacity:1;filter:brightness(1.12)}
    button.ok{background:#059669}
    svg{width:13px;height:13px;pointer-events:none}`;
  try { // constructable stylesheets are exempt from the page's style-src CSP
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch (_) {
    const st = document.createElement('style'); st.textContent = CSS; root.appendChild(st);
  }

  // Build SVG with DOM APIs (innerHTML is blocked on Trusted Types sites)
  const NS = 'http://www.w3.org/2000/svg';
  function svgIcon(kind) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const [k, v] of [['fill', 'none'], ['stroke', '#fff'], ['stroke-width', kind === 'ok' ? '3' : '2.2'],
                          ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) svg.setAttribute(k, v);
    const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); };
    if (kind === 'ok') add('path', { d: 'M5 12.5l4.5 4.5L19 7.5' });
    else { add('rect', { x: 3, y: 5, width: 18, height: 14, rx: 2.5 }); add('path', { d: 'M3.5 7l8.5 6.5L20.5 7' }); }
    return svg;
  }
  const setIcon = (btn, kind) => { btn.textContent = ''; btn.appendChild(svgIcon(kind)); };

  /* ---------- detection ---------- */
  function isEmailField(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    const type = (el.type || 'text').toLowerCase();
    if (type === 'email') return true;
    if (type !== 'text') return false;
    let meta = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.autocomplete, el.getAttribute('data-testid')].join(' ');
    try { if (el.labels && el.labels[0]) meta += ' ' + el.labels[0].textContent; } catch (_) {}
    meta = meta.toLowerCase().replace(/[_\-.\[\]]+/g, ' ');
    return /e ?mail/.test(meta) && !/search/.test(meta);
  }
  function collect(rootNode, out) {
    rootNode.querySelectorAll('input').forEach(e => { if (isEmailField(e)) out.add(e); });
    rootNode.querySelectorAll('*').forEach(e => { if (e.shadowRoot) collect(e.shadowRoot, out); });
  }

  /* ---------- fill ---------- */
  function setVal(el, v) {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    el.focus();
    if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function send(msg) {
    return new Promise(res => {
      try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }); }
      catch (_) { teardown(); res(null); }
    });
  }
  async function onClick(input, btn, ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.shiftKey) { await send({ type: 'autofill' }); flashOk(btn); return; }
    if (!email) { const r = await send({ type: 'ensure' }); email = r && r.email; }
    if (!email) return;
    setVal(input, email);
    flashOk(btn);
  }
  function flashOk(btn) {
    btn.classList.add('ok'); setIcon(btn, 'ok');
    setTimeout(() => { btn.classList.remove('ok'); setIcon(btn, 'mail'); }, 1200);
  }

  /* ---------- icon management ---------- */
  function makeButton(input) {
    const b = document.createElement('button');
    setIcon(b, 'mail');
    b.title = 'Fill temp email  (Shift+click: autofill whole form)';
    b.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the field
    b.addEventListener('click', e => onClick(input, b, e));
    root.appendChild(b);
    return b;
  }

  function topIsField(input, x, y) {
    const rn = input.getRootNode();
    const t = (rn && rn.elementFromPoint ? rn : document).elementFromPoint(x, y);
    if (!t || t === input || input.contains(t) || t.contains(input)) return true;
    // floating labels / icon wrappers live a few levels around the input — treat them as part of the field
    let p = input.parentElement;
    for (let i = 0; i < 4 && p && p !== document.body && p !== document.documentElement; i++, p = p.parentElement) {
      if (p.contains(t)) return true;
    }
    return false;
  }

  function position() {
    if (dead) return;
    for (const [input, btn] of tracked) {
      if (!input.isConnected) { btn.remove(); tracked.delete(input); continue; }
      const r = input.getBoundingClientRect();
      let show = enabled && r.width >= 80 && r.height >= 18 && r.height <= 120 &&
                 r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && !input.disabled;
      if (show) {
        const cs = getComputedStyle(input);
        show = cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
      }
      if (show) show = topIsField(input, Math.min(r.left + r.width / 2, innerWidth - 1), r.top + r.height / 2);
      if (!show) { btn.style.display = 'none'; continue; }
      const x = Math.min(r.right - SIZE - 6, innerWidth - SIZE - 2);
      const y = r.top + (r.height - SIZE) / 2;
      btn.style.display = 'flex';
      btn.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    }
  }

  function scan() {
    if (dead || !enabled) return;
    const found = new Set();
    collect(document, found);
    for (const el of found) if (!tracked.has(el)) tracked.set(el, makeButton(el));
    position();
  }

  /* ---------- scheduling ---------- */
  let raf = 0, scanT = 0;
  const schedulePos = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; position(); }); };
  const scheduleScan = () => { clearTimeout(scanT); scanT = setTimeout(scan, 250); };

  function start() {
    if (!document.documentElement) return;
    document.documentElement.appendChild(host);
    addEventListener('scroll', schedulePos, { capture: true, passive: true });
    addEventListener('resize', schedulePos, { passive: true });
    document.addEventListener('focusin', e => {
      if (isEmailField(e.target) && !tracked.has(e.target)) { tracked.set(e.target, makeButton(e.target)); schedulePos(); }
    }, true);
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => { if (!document.hidden) { scheduleScan(); schedulePos(); } }, 2500);
    setInterval(() => { if (!document.hidden && tracked.size) schedulePos(); }, 400);
    scan();
  }

  function teardown() {
    dead = true;
    try { host.remove(); } catch (_) {}
    tracked.clear();
  }

  /* ---------- state from storage ---------- */
  async function load() {
    try {
      const { current, settings } = await chrome.storage.local.get(['current', 'settings']);
      email = current ? current.email : null;
      enabled = !settings || settings.showIcon !== false;
      if (!enabled) for (const b of tracked.values()) b.style.display = 'none'; else scan();
    } catch (_) { teardown(); }
  }
  try {
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.current || ch.settings)) load(); });
  } catch (_) {}

  load();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
