/* TempMail: mini envelope icon inside email fields. Click = fill temp email. Shift+click = autofill whole form.
   Performance model: nothing runs until an email field exists; only fields in the viewport are measured
   (IntersectionObserver); DOM changes are handled incrementally (added nodes only); layout reads and writes
   are batched; no timers run while no email field is visible. */
(() => {
  if (window.__tmIconLoaded) return;
  window.__tmIconLoaded = true;
  // 1x1 tracker / ad frames never contain a usable form
  if (window !== window.top && (innerWidth < 100 || innerHeight < 30)) return;

  let email = null, dead = false, active = false;
  const tracked = new Map(); // input -> { btn }
  const inView = new Set();  // inputs currently intersecting the viewport
  const pending = new Set(); // added nodes waiting to be scanned
  let observedRoots = new WeakSet();
  let io = null, mo = null, host = null, root = null;
  let raf = 0, scanT = 0, tickT = 0;
  const SIZE = 22;

  /* ---------- overlay (created lazily, closed shadow root so page CSS/JS can't touch it) ---------- */
  const CSS = `button{all:initial;position:fixed;top:0;left:0;width:${SIZE}px;height:${SIZE}px;border-radius:50%;
      background:#4f46e5;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;pointer-events:auto;
      display:none;align-items:center;justify-content:center;opacity:.92;transition:transform .12s,opacity .12s,background .2s}
    button:hover{opacity:1;filter:brightness(1.12)}
    button.ok{background:#059669}
    svg{width:13px;height:13px;pointer-events:none}`;
  let sheet = null;
  function ensureHost() {
    if (host) return true;
    if (!document.documentElement) return false;
    host = document.createElement('tempmail-icons');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    root = host.attachShadow({ mode: 'closed' });
    try { // constructable stylesheets are exempt from the page's style-src CSP
      if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); }
      root.adoptedStyleSheets = [sheet];
    } catch (_) {
      const st = document.createElement('style'); st.textContent = CSS; root.appendChild(st);
    }
    document.documentElement.appendChild(host);
    return true;
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

  function consider(el) {
    if (!active || tracked.has(el) || !isEmailField(el)) return;
    tracked.set(el, { btn: null });
    io.observe(el); // the observer reports when it enters the viewport
  }

  function watchRoot(sr) {
    if (observedRoots.has(sr)) return;
    observedRoots.add(sr);
    mo.observe(sr, { childList: true, subtree: true });
    scanTree(sr);
  }

  // Scan only the given subtree (never the whole document except on first load)
  function scanTree(node) {
    if (!node.querySelectorAll) return;
    if (node.localName === 'input') consider(node);
    node.querySelectorAll('input').forEach(consider);
    if (node.shadowRoot) watchRoot(node.shadowRoot);
    node.querySelectorAll('*').forEach(e => { if (e.shadowRoot) watchRoot(e.shadowRoot); });
  }

  function flush() {
    scanT = 0;
    if (!active) return;
    const nodes = [...pending]; pending.clear();
    if (nodes.length > 300) { scanTree(document); return; } // huge re-render: one pass beats hundreds of subtree scans
    for (const n of nodes) if (n.isConnected) scanTree(n);
  }
  const scheduleScan = () => { if (!scanT) scanT = setTimeout(flush, 200); };

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
    if (!ensureHost()) return null;
    const b = document.createElement('button');
    setIcon(b, 'mail');
    b.title = 'Fill temp email  (Shift+click: autofill whole form)';
    b.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the field
    b.addEventListener('click', e => onClick(input, b, e));
    root.appendChild(b);
    return b;
  }

  function drop(input) {
    const rec = tracked.get(input);
    if (rec && rec.btn) rec.btn.remove();
    tracked.delete(input); inView.delete(input);
    try { io.unobserve(input); } catch (_) {}
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

  // Phase 1 reads layout for every visible field, phase 2 writes styles: no layout thrashing.
  function position() {
    if (dead || !active || !inView.size) return;
    const results = [];
    for (const input of inView) {
      if (!input.isConnected) { drop(input); continue; }
      const r = input.getBoundingClientRect();
      let show = !input.disabled && r.width >= 80 && r.height >= 18 && r.height <= 120 &&
                 r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      if (show) {
        const cs = getComputedStyle(input);
        show = cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
      }
      if (show) show = topIsField(input, Math.min(r.left + r.width / 2, innerWidth - 1), r.top + r.height / 2);
      results.push([input, show, r]);
    }
    for (const [input, show, r] of results) {
      const rec = tracked.get(input);
      if (!rec) continue;
      if (!show) { if (rec.btn) rec.btn.style.display = 'none'; continue; }
      if (!rec.btn && !(rec.btn = makeButton(input))) continue;
      const x = Math.min(r.right - SIZE - 6, innerWidth - SIZE - 2);
      const y = r.top + (r.height - SIZE) / 2;
      rec.btn.style.display = 'flex';
      rec.btn.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    }
  }

  /* ---------- scheduling ---------- */
  const schedulePos = () => { if (!raf && inView.size) raf = requestAnimationFrame(() => { raf = 0; position(); }); };
  // Safety net for layout changes that fire no event (CSS animations, late-loading fonts).
  // Runs only while at least one email field is on screen and the tab is visible.
  function ensureTick() {
    if (tickT || !inView.size) return;
    tickT = setTimeout(() => { tickT = 0; if (!document.hidden) position(); ensureTick(); }, 1000);
  }
  const onFocusIn = e => {
    const t = e.composedPath ? e.composedPath()[0] : e.target; // sees through open shadow roots
    if (t instanceof HTMLInputElement) consider(t);
  };

  function onIntersect(entries) {
    for (const e of entries) {
      const rec = tracked.get(e.target);
      if (!rec) continue;
      if (e.isIntersecting) inView.add(e.target);
      else {
        inView.delete(e.target);
        if (rec.btn) rec.btn.style.display = 'none';
        if (!e.target.isConnected) drop(e.target); // removed from the page: release it
      }
    }
    schedulePos(); ensureTick();
  }

  function activate() {
    if (active || dead || !document.documentElement) return;
    active = true;
    io = new IntersectionObserver(onIntersect);
    mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && n !== host) pending.add(n);
      if (pending.size) scheduleScan();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('scroll', schedulePos, { capture: true, passive: true });
    addEventListener('resize', schedulePos, { passive: true });
    document.addEventListener('focusin', onFocusIn, true);
    (window.requestIdleCallback || setTimeout)(() => { if (active) scanTree(document); }); // initial pass, off the critical path
  }

  function deactivate() {
    if (!active) return;
    active = false;
    io.disconnect(); mo.disconnect(); io = mo = null;
    removeEventListener('scroll', schedulePos, true);
    removeEventListener('resize', schedulePos);
    document.removeEventListener('focusin', onFocusIn, true);
    clearTimeout(scanT); clearTimeout(tickT); scanT = tickT = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    tracked.clear(); inView.clear(); pending.clear(); observedRoots = new WeakSet();
    if (host) { try { host.remove(); } catch (_) {} host = root = null; }
  }

  function teardown() { dead = true; deactivate(); }

  /* ---------- state from storage ---------- */
  const wantsIcon = settings => !settings || settings.showIcon !== false;
  async function load() {
    try {
      const { current, settings } = await chrome.storage.local.get(['current', 'settings']);
      email = current ? current.email : null;
      wantsIcon(settings) ? activate() : deactivate();
    } catch (_) { teardown(); }
  }
  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.current) email = ch.current.newValue ? ch.current.newValue.email : null;
      if (ch.settings) wantsIcon(ch.settings.newValue) ? activate() : deactivate(); // no storage re-read, no rescan
    });
  } catch (_) {}

  load();
})();
